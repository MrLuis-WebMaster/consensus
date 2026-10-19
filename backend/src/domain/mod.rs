use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Election {
    pub id: String,
    pub title: String,
    pub mechanism_type: String,
    pub territory_divipola: String,
    pub status: Status,
    pub options: Vec<String>,
    /// Stores only pseudonymous participation markers, never pairing voter -> chosen option.
    pub votes: Vec<String>,
    /// Aggregated tallies per option.
    pub tallies: BTreeMap<String, u32>,
    pub stellar_network: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Status {
    Draft,
    Open,
    Closed,
    Cancelled,
}

#[derive(Debug, Error, PartialEq)]
pub enum DomainError {
    #[error("election is not open")]
    NotOpen,
    #[error("voter already voted")]
    DuplicateVote,
    #[error("unknown option")]
    UnknownOption,
    #[error("invalid state transition")]
    InvalidStateTransition,
    #[error("at least two options are required to open")]
    OptionsIncomplete,
    #[error("invalid stellar network: only TESTNET is permitted in MVP")]
    InvalidNetwork,
}

impl Election {
    pub fn new_demo() -> Self {
        let options = vec![
            "A".to_string(),
            "B".to_string(),
            "VOTO_EN_BLANCO".to_string(),
        ];
        let mut tallies = BTreeMap::new();
        for opt in &options {
            tallies.insert(opt.clone(), 0);
        }
        Self {
            id: "demo-001".into(),
            title: "Elección comunitaria sintética — Medellín (05001)".into(),
            mechanism_type: "consulta_popular".into(),
            territory_divipola: "05001".into(),
            status: Status::Open,
            options,
            votes: vec![],
            tallies,
            stellar_network: "TESTNET".into(),
        }
    }

    pub fn transition(&mut self, next: Status) -> Result<(), DomainError> {
        match (&self.status, &next) {
            (Status::Draft, Status::Open) => {
                if self.options.len() < 2 {
                    return Err(DomainError::OptionsIncomplete);
                }
                self.status = Status::Open;
                Ok(())
            }
            (Status::Open, Status::Closed) => {
                self.status = Status::Closed;
                Ok(())
            }
            (Status::Draft | Status::Open, Status::Cancelled) => {
                self.status = Status::Cancelled;
                Ok(())
            }
            _ => Err(DomainError::InvalidStateTransition),
        }
    }

    pub fn validate_vote(&self, voter_marker: &str, option: &str, network: &str) -> Result<(), DomainError> {
        if network != "TESTNET" {
            return Err(DomainError::InvalidNetwork);
        }
        if self.status != Status::Open {
            return Err(DomainError::NotOpen);
        }
        if self.votes.iter().any(|v| v == voter_marker) {
            return Err(DomainError::DuplicateVote);
        }
        if !self.options.iter().any(|o| o == option) {
            return Err(DomainError::UnknownOption);
        }
        Ok(())
    }

    pub fn cast(&mut self, voter: String, option: &str) -> Result<(), DomainError> {
        self.validate_vote(&voter, option, "TESTNET")?;
        self.votes.push(voter);
        let entry = self.tallies.entry(option.to_string()).or_insert(0);
        *entry += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_duplicate_voter() {
        let mut e = Election::new_demo();
        assert!(e.cast("v1".into(), "A").is_ok());
        assert!(matches!(e.cast("v1".into(), "A"), Err(DomainError::DuplicateVote)));
        assert_eq!(e.tallies.get("A"), Some(&1));
    }

    #[test]
    fn rejects_vote_when_closed() {
        let mut e = Election::new_demo();
        e.status = Status::Closed;
        assert!(matches!(e.cast("v1".into(), "A"), Err(DomainError::NotOpen)));
    }

    #[test]
    fn rejects_unknown_option_and_non_testnet_network() {
        let e = Election::new_demo();
        assert_eq!(e.validate_vote("v1", "INVALID", "TESTNET"), Err(DomainError::UnknownOption));
        assert_eq!(e.validate_vote("v1", "A", "PUBLIC"), Err(DomainError::InvalidNetwork));
    }

    #[test]
    fn enforces_valid_state_transitions() {
        let mut e = Election::new_demo();
        e.status = Status::Draft;
        assert!(e.transition(Status::Open).is_ok());
        assert!(e.transition(Status::Closed).is_ok());
        assert_eq!(e.transition(Status::Open), Err(DomainError::InvalidStateTransition));
    }
}
