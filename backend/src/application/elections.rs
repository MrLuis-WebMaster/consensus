use std::sync::{Arc, RwLock};
use crate::domain::{DomainError, Election, Status};

#[derive(Clone, Default)]
pub struct ElectionService {
    state: Arc<RwLock<Option<Election>>>,
}

impl ElectionService {
    pub fn snapshot(&self) -> Option<Election> {
        self.state.read().unwrap().clone()
    }

    pub fn demo(&self) -> Election {
        let mut lock = self.state.write().unwrap();
        lock.get_or_insert_with(Election::new_demo).clone()
    }

    pub fn validate_vote(
        &self,
        voter_marker: &str,
        option: &str,
        network: &str,
    ) -> Result<(), DomainError> {
        let election = self.demo();
        election.validate_vote(voter_marker, option, network)
    }

    pub fn cast_vote(&self, voter_marker: String, option: &str) -> Result<Election, DomainError> {
        let mut lock = self.state.write().unwrap();
        let election = lock.get_or_insert_with(Election::new_demo);
        election.cast(voter_marker, option)?;
        Ok(election.clone())
    }

    pub fn transition(&self, next: Status) -> Result<Election, DomainError> {
        let mut lock = self.state.write().unwrap();
        let election = lock.get_or_insert_with(Election::new_demo);
        election.transition(next)?;
        Ok(election.clone())
    }
}
