use std::sync::Arc;
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use crate::application::elections::ElectionService;
use crate::domain::Status;

#[derive(Deserialize)]
pub struct VoteValidationInput {
    pub voter_marker: String,
    pub option: String,
    pub stellar_network: Option<String>,
}

#[derive(Deserialize)]
pub struct StateTransitionInput {
    pub target_status: Status,
}

pub fn router(service: Arc<ElectionService>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/elections/demo", get(demo))
        .route("/api/v1/elections/validate-vote", post(validate_vote))
        .route("/api/v1/elections/demo/cast", post(cast_demo_vote))
        .route("/api/v1/elections/demo/state", post(transition_demo_state))
        .with_state(service)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

async fn health() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "ok",
            "service": "consensus-rust-domain-backend",
            "stellar_network": "TESTNET"
        })),
    )
}

async fn demo(State(service): State<Arc<ElectionService>>) -> Json<crate::domain::Election> {
    Json(service.demo())
}

async fn validate_vote(
    State(service): State<Arc<ElectionService>>,
    Json(input): Json<VoteValidationInput>,
) -> (StatusCode, Json<serde_json::Value>) {
    let net = input.stellar_network.as_deref().unwrap_or("TESTNET");
    match service.validate_vote(&input.voter_marker, &input.option, net) {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "valid": true, "stellar_network": net })),
        ),
        Err(err) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "valid": false, "error": err.to_string() })),
        ),
    }
}

async fn cast_demo_vote(
    State(service): State<Arc<ElectionService>>,
    Json(input): Json<VoteValidationInput>,
) -> (StatusCode, Json<serde_json::Value>) {
    let net = input.stellar_network.as_deref().unwrap_or("TESTNET");
    if let Err(err) = service.validate_vote(&input.voter_marker, &input.option, net) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "accepted": false, "error": err.to_string() })),
        );
    }
    match service.cast_vote(input.voter_marker, &input.option) {
        Ok(updated) => (
            StatusCode::OK,
            Json(serde_json::json!({ "accepted": true, "election": updated })),
        ),
        Err(err) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "accepted": false, "error": err.to_string() })),
        ),
    }
}

async fn transition_demo_state(
    State(service): State<Arc<ElectionService>>,
    Json(input): Json<StateTransitionInput>,
) -> (StatusCode, Json<serde_json::Value>) {
    match service.transition(input.target_status) {
        Ok(updated) => (
            StatusCode::OK,
            Json(serde_json::json!({ "updated": true, "election": updated })),
        ),
        Err(err) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "updated": false, "error": err.to_string() })),
        ),
    }
}
