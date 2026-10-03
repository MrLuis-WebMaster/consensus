#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, Symbol, symbol_short};

#[contract]
pub struct Voting;
#[contractimpl]
impl Voting {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("OPEN"), &false);
    }

    pub fn open(env: Env) {
        let admin: Address = env.storage().instance().get(&symbol_short!("ADMIN")).unwrap();
        admin.require_auth();
        let open: bool = env.storage().instance().get(&symbol_short!("OPEN")).unwrap_or(false);
        if open { panic!("already_open") };
        env.storage().instance().set(&symbol_short!("OPEN"), &true);
    }

    pub fn cast(env: Env, voter: Address, option: Symbol) { voter.require_auth(); let open: bool = env.storage().instance().get(&symbol_short!("OPEN")).unwrap_or(false); if !open { panic!("closed") }; let key = (symbol_short!("V"), voter); if env.storage().persistent().has(&key) { panic!("duplicate") }; env.storage().persistent().set(&key, &option); env.events().publish((symbol_short!("VOTE"),), option); }

    pub fn close(env: Env) {
        let admin: Address = env.storage().instance().get(&symbol_short!("ADMIN")).unwrap();
        admin.require_auth();
        let open: bool = env.storage().instance().get(&symbol_short!("OPEN")).unwrap_or(false);
        if !open { panic!("not_open") };
        env.storage().instance().set(&symbol_short!("OPEN"), &false);
    }
}
