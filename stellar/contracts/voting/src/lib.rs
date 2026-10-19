#![no_std]

//! Consensus Colombia — Soroban Voting Smart Contract (Educational MVP on Stellar Testnet)
//!
//! PRIVACY & BALLOT SECRECY LIMITATION:
//! On-chain invocations and events (`cast`, `VOTE`) are publicly visible on the Stellar ledger
//! and allow observers to reconstruct which `Address` selected which `Symbol` option.
//! Encrypting data in the frontend does NOT make an on-chain transaction secret.
//! NEVER store real names, emails, document numbers, biometric templates, or real votes here.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contract]
pub struct Voting;

#[contracttype]
#[derive(Clone)]
enum Key {
    Admin,
    ProcessId,
    Open,
    Closed,
    OpensAt,
    ClosesAt,
    OptionCount,
    Territory,
    Option(Symbol),
    Authorized(Address),
    Voted(Address),
    Tally(Symbol),
    TotalVotes,
}

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Error {
    NotInitialized = 2,
    AlreadyOpen = 3,
    NotOpen = 4,
    AlreadyClosed = 5,
    OptionsIncomplete = 6,
    TooManyOptions = 7,
    DuplicateOption = 8,
    UnknownOption = 9,
    AlreadyAuthorized = 10,
    NotAuthorized = 11,
    AlreadyVoted = 12,
    ElectionClosed = 13,
    OutOfVotingWindow = 14,
    InvalidTimeWindow = 15,
}

#[contractimpl]
impl Voting {
    /// Bind administration at deployment time so no public initialize race exists.
    /// Configure that G-account with Stellar signer weights/thresholds (5-of-8) for multisig.
    pub fn __constructor(env: Env, admin: Address, territory: Symbol) {
        admin.require_auth();
        let instance = env.storage().instance();
        instance.set(&Key::Admin, &admin);
        instance.set(&Key::Territory, &territory);
        instance.set(&Key::ProcessId, &symbol_short!("DEFAULT"));
        instance.set(&Key::Open, &false);
        instance.set(&Key::Closed, &false);
        instance.set(&Key::OptionCount, &0_u32);
        instance.set(&Key::TotalVotes, &0_u32);
    }

    /// Configures a unique process identifier and optional ledger timestamp window [opens_at, closes_at].
    pub fn configure_process(
        env: Env,
        process_id: Symbol,
        opens_at: u64,
        closes_at: u64,
    ) -> Result<(), Error> {
        require_admin(&env)?;
        ensure_configurable(&env)?;
        if closes_at > 0 && closes_at <= opens_at {
            return Err(Error::InvalidTimeWindow);
        }
        let instance = env.storage().instance();
        instance.set(&Key::ProcessId, &process_id);
        instance.set(&Key::OpensAt, &opens_at);
        instance.set(&Key::ClosesAt, &closes_at);
        instance.extend_ttl(30_000, 500_000);
        env.events()
            .publish((symbol_short!("CONFIG"), process_id), (opens_at, closes_at));
        Ok(())
    }

    pub fn add_option(env: Env, option: Symbol) -> Result<(), Error> {
        require_admin(&env)?;
        ensure_configurable(&env)?;
        let instance = env.storage().instance();
        let count: u32 = instance.get(&Key::OptionCount).unwrap_or(0);
        if count >= 12 {
            return Err(Error::TooManyOptions);
        }
        let key = Key::Option(option.clone());
        if instance.has(&key) {
            return Err(Error::DuplicateOption);
        }
        instance.set(&key, &true);
        instance.set(&Key::OptionCount, &(count + 1));
        instance.set(&Key::Tally(option.clone()), &0_u32);
        instance.extend_ttl(30_000, 500_000);
        env.events().publish((symbol_short!("OPTION"),), option);
        Ok(())
    }

    pub fn authorize_voter(env: Env, voter: Address) -> Result<(), Error> {
        require_admin(&env)?;
        ensure_configurable(&env)?;
        let key = Key::Authorized(voter.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyAuthorized);
        }
        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, 30_000, 500_000);
        env.storage().instance().extend_ttl(30_000, 500_000);
        env.events().publish((symbol_short!("AUTH"),), voter);
        Ok(())
    }

    pub fn open(env: Env) -> Result<(), Error> {
        require_admin(&env)?;
        let instance = env.storage().instance();
        if instance.get::<_, bool>(&Key::Closed).unwrap_or(false) {
            return Err(Error::AlreadyClosed);
        }
        if instance.get::<_, bool>(&Key::Open).unwrap_or(false) {
            return Err(Error::AlreadyOpen);
        }
        if instance.get::<_, u32>(&Key::OptionCount).unwrap_or(0) < 2 {
            return Err(Error::OptionsIncomplete);
        }
        instance.set(&Key::Open, &true);
        instance.extend_ttl(30_000, 500_000);
        env.events().publish((symbol_short!("OPEN"),), ());
        Ok(())
    }

    pub fn cast(env: Env, voter: Address, option: Symbol) -> Result<(), Error> {
        voter.require_auth();
        let instance = env.storage().instance();
        if instance.get::<_, bool>(&Key::Closed).unwrap_or(false) {
            return Err(Error::ElectionClosed);
        }
        if !instance.get::<_, bool>(&Key::Open).unwrap_or(false) {
            return Err(Error::NotOpen);
        }

        // Enforce optional ledger timestamp window when configured
        let opens_at: u64 = instance.get(&Key::OpensAt).unwrap_or(0);
        let closes_at: u64 = instance.get(&Key::ClosesAt).unwrap_or(0);
        if opens_at > 0 || closes_at > 0 {
            let now = env.ledger().timestamp();
            if (opens_at > 0 && now < opens_at) || (closes_at > 0 && now > closes_at) {
                return Err(Error::OutOfVotingWindow);
            }
        }

        if !env.storage().persistent().has(&Key::Authorized(voter.clone())) {
            return Err(Error::NotAuthorized);
        }
        env.storage()
            .persistent()
            .extend_ttl(&Key::Authorized(voter.clone()), 30_000, 500_000);
        let option_key = Key::Option(option.clone());
        if !instance.get::<_, bool>(&option_key).unwrap_or(false) {
            return Err(Error::UnknownOption);
        }
        let vote_key = Key::Voted(voter.clone());
        if env.storage().persistent().has(&vote_key) {
            return Err(Error::AlreadyVoted);
        }

        env.storage().persistent().set(&vote_key, &true);
        env.storage().persistent().extend_ttl(&vote_key, 30_000, 500_000);
        let tally_key = Key::Tally(option.clone());
        let tally: u32 = instance.get(&tally_key).unwrap_or(0);
        instance.set(&tally_key, &(tally + 1));
        let total: u32 = instance.get(&Key::TotalVotes).unwrap_or(0);
        instance.set(&Key::TotalVotes, &(total + 1));
        instance.extend_ttl(30_000, 500_000);
        // The public event intentionally reveals the selected option. Use only synthetic votes.
        env.events().publish((symbol_short!("VOTE"), option), total + 1);
        Ok(())
    }

    pub fn close(env: Env) -> Result<(), Error> {
        require_admin(&env)?;
        let instance = env.storage().instance();
        if instance.get::<_, bool>(&Key::Closed).unwrap_or(false) {
            return Err(Error::AlreadyClosed);
        }
        if !instance.get::<_, bool>(&Key::Open).unwrap_or(false) {
            return Err(Error::NotOpen);
        }
        instance.set(&Key::Open, &false);
        instance.set(&Key::Closed, &true);
        instance.extend_ttl(30_000, 500_000);
        env.events().publish((symbol_short!("CLOSE"),), ());
        Ok(())
    }

    pub fn status(env: Env) -> (bool, bool) {
        let instance = env.storage().instance();
        (
            instance.get(&Key::Open).unwrap_or(false),
            instance.get(&Key::Closed).unwrap_or(false),
        )
    }

    pub fn territory(env: Env) -> Symbol {
        env.storage().instance().get(&Key::Territory).unwrap()
    }

    pub fn process_id(env: Env) -> Symbol {
        env.storage()
            .instance()
            .get(&Key::ProcessId)
            .unwrap_or(symbol_short!("DEFAULT"))
    }

    pub fn result(env: Env, option: Symbol) -> Result<u32, Error> {
        if !env
            .storage()
            .instance()
            .get::<_, bool>(&Key::Option(option.clone()))
            .unwrap_or(false)
        {
            return Err(Error::UnknownOption);
        }
        Ok(env
            .storage()
            .instance()
            .get(&Key::Tally(option))
            .unwrap_or(0))
    }

    pub fn total_votes(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&Key::TotalVotes)
            .unwrap_or(0)
    }
}

fn require_admin(env: &Env) -> Result<(), Error> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&Key::Admin)
        .ok_or(Error::NotInitialized)?;
    admin.require_auth();
    Ok(())
}

fn ensure_configurable(env: &Env) -> Result<(), Error> {
    let instance = env.storage().instance();
    if instance.get::<_, bool>(&Key::Closed).unwrap_or(false) {
        return Err(Error::AlreadyClosed);
    }
    if instance.get::<_, bool>(&Key::Open).unwrap_or(false) {
        return Err(Error::AlreadyOpen);
    }
    Ok(())
}

#[cfg(test)]
mod test {
    use super::{Error, Voting, VotingClient};
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Ledger},
        Address, Env,
    };

    #[test]
    fn authorized_voter_can_vote_once_and_results_are_counted() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register(Voting, (&admin, &symbol_short!("MED")));
        let client = VotingClient::new(&env, &contract_id);
        let voter = Address::generate(&env);

        client.add_option(&symbol_short!("A"));
        client.add_option(&symbol_short!("B"));
        client.authorize_voter(&voter);
        client.open();
        client.cast(&voter, &symbol_short!("A"));

        assert_eq!(client.result(&symbol_short!("A")), 1);
        assert_eq!(client.result(&symbol_short!("B")), 0);
        assert_eq!(client.total_votes(), 1);
        assert_eq!(client.status(), (true, false));
    }

    #[test]
    fn unauthorized_voter_is_rejected() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register(Voting, (&admin, &symbol_short!("MED")));
        let client = VotingClient::new(&env, &contract_id);
        let voter = Address::generate(&env);

        client.add_option(&symbol_short!("A"));
        client.add_option(&symbol_short!("B"));
        client.open();

        assert_eq!(
            client.try_cast(&voter, &symbol_short!("A")),
            Err(Ok(Error::NotAuthorized))
        );
    }

    #[test]
    fn second_vote_is_rejected() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register(Voting, (&admin, &symbol_short!("MED")));
        let client = VotingClient::new(&env, &contract_id);
        let voter = Address::generate(&env);

        client.add_option(&symbol_short!("A"));
        client.add_option(&symbol_short!("B"));
        client.authorize_voter(&voter);
        client.open();
        client.cast(&voter, &symbol_short!("A"));

        assert_eq!(
            client.try_cast(&voter, &symbol_short!("B")),
            Err(Ok(Error::AlreadyVoted))
        );
    }

    #[test]
    fn election_cannot_open_with_fewer_than_two_options() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register(Voting, (&admin, &symbol_short!("MED")));
        let client = VotingClient::new(&env, &contract_id);

        client.add_option(&symbol_short!("A"));

        assert_eq!(client.try_open(), Err(Ok(Error::OptionsIncomplete)));
    }

    #[test]
    fn rejects_votes_before_opening_after_closing_and_outside_time_window() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register(Voting, (&admin, &symbol_short!("ANT05")));
        let client = VotingClient::new(&env, &contract_id);
        let voter = Address::generate(&env);

        client.configure_process(&symbol_short!("PLEB26"), &1000_u64, &2000_u64);
        assert_eq!(client.process_id(), symbol_short!("PLEB26"));

        client.add_option(&symbol_short!("SI"));
        client.add_option(&symbol_short!("NO"));
        client.authorize_voter(&voter);

        // Vote before open -> NotOpen
        assert_eq!(
            client.try_cast(&voter, &symbol_short!("SI")),
            Err(Ok(Error::NotOpen))
        );

        client.open();

        // Ledger timestamp before window (500 < 1000) -> OutOfVotingWindow
        env.ledger().with_mut(|li| li.timestamp = 500);
        assert_eq!(
            client.try_cast(&voter, &symbol_short!("SI")),
            Err(Ok(Error::OutOfVotingWindow))
        );

        // Ledger timestamp inside window (1500 in [1000, 2000]) -> UnknownOption rejected, valid accepted
        env.ledger().with_mut(|li| li.timestamp = 1500);
        assert_eq!(
            client.try_cast(&voter, &symbol_short!("NULO")),
            Err(Ok(Error::UnknownOption))
        );
        client.cast(&voter, &symbol_short!("SI"));
        assert_eq!(client.total_votes(), 1);

        // Close election -> further votes rejected with ElectionClosed
        client.close();
        let voter2 = Address::generate(&env);
        assert_eq!(
            client.try_cast(&voter2, &symbol_short!("NO")),
            Err(Ok(Error::ElectionClosed))
        );
    }
}
