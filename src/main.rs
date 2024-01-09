use std::env;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use lambda_http::http::StatusCode;
use lambda_http::{run, service_fn, Error, IntoResponse, Request, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha3::Sha3_256;
use tracing::{debug, error, info};

type HmacSha3_256 = Hmac<Sha3_256>;

/// Secret Body Definition used for deserializing from the AWS Secerts Manager
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct MomentoSecretString {
    momento_secret: String,
}

/// Main Payload coming from the Momento Webhook
#[derive(Serialize, Deserialize, Debug)]
struct MomentoPayload {
    cache: String,
    topic: String,
    event_timestamp: i64,
    publish_timestamp: i64,
    topic_sequence_number: i64,
    token_id: Option<String>,
    text: String,
}

/// answers the question as to whether the received payloads publish time is within the
/// second limit of being "fresh" enough.  Anything older than 60 seconds will be marked as rejected
fn is_request_new_enough(published: i64) -> bool {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");

    // let time_since_published = since_the_epoch.as_millis() - published as u128;
    let new_duration = Duration::from_millis(published as u64);
    let calculated = since_the_epoch - new_duration;

    debug!(
        since_the_epoch = since_the_epoch.as_millis(),
        published = published,
        time_since_published = calculated.as_secs(),
        "Time since published"
    );
    calculated.as_secs() < 60
}

/// Main function handler.  This is executed when a request comes in via the Function URL
async fn function_handler(
    client: &aws_sdk_eventbridge::Client,
    secret_string: &MomentoSecretString,
    bus_name: &String,
    event: Request,
) -> Result<impl IntoResponse, Error> {
    let mut status_code = StatusCode::OK;
    let mut return_body = "Success";

    // extra and parse the body of the request into a MomentoPayload
    let body = event.body();
    let body_string = std::str::from_utf8(body).expect("Body wasn't supplied");
    let payload: Result<MomentoPayload, serde_json::Error> = serde_json::from_str(body_string);
    let header_value = event.headers().get("momento-signature");

    // header value is required to compare against the HMAC of the incoming payload
    match header_value {
        Some(header_value) => match payload {
            Ok(payload) => {
                let new_enough = is_request_new_enough(payload.publish_timestamp);
                if !new_enough {
                    error!(
                        "Request is not new enough.  Publish time is {}",
                        payload.publish_timestamp
                    );
                    status_code = StatusCode::FORBIDDEN;
                    return_body = "Unauthorized";
                }

                let verified =
                    verify_signature(&payload, secret_string, header_value.to_str().unwrap());
                if verified {
                    send_to_event_bridge(client, &payload, bus_name).await;
                } else {
                    error!("Signature verification failed");
                    status_code = StatusCode::FORBIDDEN;
                    return_body = "Unauthorized";
                }
            }
            Err(_e) => {
                error!("Error parsing Momento payload");
                status_code = StatusCode::FORBIDDEN;
                return_body = "Unauthorized";
            }
        },
        None => {
            error!("Header momento-signature is missing");
            status_code = StatusCode::FORBIDDEN;
            return_body = "Unauthorized";
        }
    }

    // the final output response sent back to the client
    let response = Response::builder()
        .status(status_code)
        .header("Content-Type", "application/json")
        .body(
            json!({
              "message": return_body,
            })
            .to_string(),
        )
        .map_err(Box::new)?;

    info!(body = return_body, "Output of request={:?}", status_code);
    Ok(response)
}

/// Sends the MomentoPayload to the Event Bridge
async fn send_to_event_bridge(
    client: &aws_sdk_eventbridge::Client,
    payload: &MomentoPayload,
    bus_name: &String,
) {
    let s = serde_json::to_string(&payload).expect("Error serde");
    let request = aws_sdk_eventbridge::types::builders::PutEventsRequestEntryBuilder::default()
        .set_source(Some(String::from("webhook")))
        .set_detail_type(Some(String::from("New Chat Message")))
        .set_detail(Some(String::from(s)))
        .set_event_bus_name(Some(bus_name.clone()))
        .build();
    client
        .put_events()
        .entries(request)
        .send()
        .await
        .expect("Something bad happened");
}

/// Verifies the signature of the incoming payload against the secret string.  Uses SHA3-256 to HMAC the incoming payload
/// and compare that against the value of the Header momento-signature that MUST be present in the request
fn verify_signature(
    payload: &MomentoPayload,
    secret_string: &MomentoSecretString,
    signature: &str,
) -> bool {
    let s = serde_json::to_string(&payload).expect("Error serde");
    let mac3 = HmacSha3_256::new_from_slice(secret_string.momento_secret.as_bytes());
    match mac3 {
        Ok(mut m) => {
            m.update(s.as_ref());
            let result3 = m.finalize();
            let code_bytes_3 = result3.into_bytes();

            hex::encode(code_bytes_3) == signature
        }
        Err(_) => false,
    }
}

/// Main function which is the starting point for the Lambda
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .with_line_number(true)
        .json()
        .init();

    let config = aws_config::load_from_env().await;
    let client = aws_sdk_eventbridge::Client::new(&config);
    let secrets_client = aws_sdk_secretsmanager::Client::new(&config);
    let shared_client = &client;

    let resp = secrets_client
        .get_secret_value()
        .secret_id("MomentoWebhookSecretKey")
        .send()
        .await?;
    let string_field = resp
        .secret_string()
        .expect("Secret string must have a value");
    let secret_string: MomentoSecretString = serde_json::from_str(&string_field)
        .expect("Secret string must serde into the correct type");
    let ss = &secret_string;
    let bus_name = env::var("EVENT_BUS_NAME").expect("EVENT_BUS_NAME must be set");
    let cloned_bus_name = &bus_name;
    run(service_fn(move |payload: Request| async move {
        function_handler(shared_client, ss, cloned_bus_name, payload).await
    }))
    .await
}
