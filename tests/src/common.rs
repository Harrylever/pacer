//! Test world: LiteSVM with both programs, a USDC-dev mint, three stand-in
//! stocks that carry the same Token-2022 extensions as the real xStocks, and a
//! configured vault program. Every test starts from `Env::new()`.
#![allow(dead_code)]

use anchor_lang::prelude::Pubkey;
use anchor_lang::{InstructionData, ToAccountMetas};
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
use litesvm::LiteSVM;
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_message::Instruction;
use solana_signer::Signer;
use solana_system_interface::instruction as system;
use solana_transaction::Transaction;
use spl_associated_token_account_interface::address::get_associated_token_address_with_program_id as ata_address;
use spl_associated_token_account_interface::instruction::create_associated_token_account_idempotent as create_ata;
use spl_token_2022_interface::extension::ExtensionType;
use spl_token_2022_interface::state::{AccountState, Mint};

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

pub const VAULT_ID: Pubkey = pacer_vault::ID;
pub const SWAP_ID: Pubkey = mock_swap::ID;
pub const TOKEN: Pubkey = spl_token_interface::ID;
pub const TOKEN_2022: Pubkey = spl_token_2022_interface::ID;
pub const ATA_PROGRAM: Pubkey = spl_associated_token_account_interface::program::ID;
pub const SYSTEM: Pubkey = solana_system_interface::program::ID;

pub const START_TS: i64 = 1_800_000_000;
pub const PERIOD: i64 = 10; // demo "day"
pub const MIN_TRADE: u64 = 100_000; // $0.10
pub const MAX_RATE: u64 = 50_000_000; // $50 per period
pub const MAX_AGE: i64 = 600;
pub const SLIPPAGE_BPS: u16 = 100;
pub const MAX_DELAY: u32 = 604_800;
pub const WINDOW: u32 = 86_400;
pub const DECIMALS_STOCK: u8 = 8;

/// micro-USDC per whole raw token, from Jupiter's `usdPricePrescaled` on Nov 4 2026.
pub const PRICES: [u64; 3] = [336_470_000, 208_396_650, 768_064_352];
pub const SYMBOLS: [&str; 3] = ["AAPLx", "NVDAx", "SPYx"];

pub struct Stock {
    pub symbol: &'static str,
    pub mint: Pubkey,
    pub price: Pubkey,
}

pub struct User {
    pub owner: Keypair,
    pub destination: Keypair,
}

pub struct Env {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub keeper: Keypair,
    pub oracle: Keypair,
    pub gas: Keypair,
    /// Stands in for the xStocks issuer: permanent delegate, freeze and pause authority.
    pub issuer: Keypair,
    /// Mint authority of USDC-dev; the backend's `/faucet` key.
    pub faucet: Keypair,
    pub usdc: Pubkey,
    pub stocks: Vec<Stock>,
    pub config: Pubkey,
    pub mock_authority: Pubkey,
    pub treasury: Pubkey,
}

fn so(name: &str) -> String {
    let p = format!("{}/../target/deploy/{name}.so", env!("CARGO_MANIFEST_DIR"));
    assert!(std::path::Path::new(&p).exists(), "missing {p}: run `anchor build` first");
    p
}

pub fn price_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"price", mint.as_ref()], &VAULT_ID).0
}
pub fn vault_pda(owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", owner.as_ref()], &VAULT_ID).0
}
pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &VAULT_ID).0
}
pub fn ata(wallet: &Pubkey, mint: &Pubkey, program: &Pubkey) -> Pubkey {
    ata_address(wallet, mint, program)
}

impl Env {
    /// Programs, keys and mints, but NO config and NO prices (for testing `init_config` itself).
    pub fn bare() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(VAULT_ID, so("pacer_vault")).unwrap();
        svm.add_program_from_file(SWAP_ID, so("mock_swap")).unwrap();
        let mut clock = svm.get_sysvar::<Clock>();
        clock.unix_timestamp = START_TS;
        svm.set_sysvar(&clock);

        let mut env = Env {
            svm,
            admin: Keypair::new(),
            keeper: Keypair::new(),
            oracle: Keypair::new(),
            gas: Keypair::new(),
            issuer: Keypair::new(),
            faucet: Keypair::new(),
            usdc: Pubkey::default(),
            stocks: vec![],
            config: config_pda(),
            mock_authority: Pubkey::find_program_address(&[b"mock_authority"], &SWAP_ID).0,
            treasury: Pubkey::default(),
        };
        for k in [&env.admin, &env.keeper, &env.oracle, &env.gas, &env.issuer, &env.faucet] {
            env.svm.airdrop(&k.pubkey(), 100_000_000_000).unwrap();
        }
        env.create_usdc();
        for (i, sym) in SYMBOLS.iter().enumerate() {
            env.create_stock(sym, i);
        }
        env.treasury = ata(&env.mock_authority, &env.usdc, &TOKEN);
        let (gas, usdc, ma) = (env.gas.pubkey(), env.usdc, env.mock_authority);
        env.send_gas(&[create_ata(&gas, &ma, &usdc, &TOKEN)], &[]).unwrap();
        env
    }

    /// The normal test world: configured, with a fresh price for every stock.
    pub fn new() -> Self {
        let mut env = Self::bare();
        env.init_config();
        for i in 0..env.stocks.len() {
            let ix = env.ix_init_price(env.stocks[i].mint);
            env.send_gas(&[ix], &[&env.admin.insecure_clone()]).unwrap();
            env.set_price(i, PRICES[i]).unwrap();
        }
        env
    }

    // ---- sending ------------------------------------------------------------

    /// Send with the gas wallet as fee payer, plus any extra signers.
    pub fn send_gas(&mut self, ixs: &[Instruction], extra: &[&Keypair]) -> TxResult {
        let gas = self.gas.insecure_clone();
        let mut signers: Vec<&Keypair> = vec![&gas];
        signers.extend(extra.iter().copied());
        let tx = Transaction::new_signed_with_payer(ixs, Some(&gas.pubkey()), &signers, self.svm.latest_blockhash());
        let res = self.svm.send_transaction(tx);
        self.svm.expire_blockhash(); // so identical transactions are never "already processed"
        res
    }

    pub fn warp(&mut self, secs: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp += secs;
        c.slot += (secs as u64).max(1);
        self.svm.set_sysvar(&c);
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    // ---- mints --------------------------------------------------------------

    fn create_usdc(&mut self) {
        let mint = Keypair::new();
        let space = 82usize;
        let lamports = self.svm.minimum_balance_for_rent_exemption(space);
        let ixs = [
            system::create_account(&self.gas.pubkey(), &mint.pubkey(), lamports, space as u64, &TOKEN),
            spl_token_interface::instruction::initialize_mint2(&TOKEN, &mint.pubkey(), &self.faucet.pubkey(), None, 6).unwrap(),
        ];
        self.send_gas(&ixs, &[&mint]).unwrap();
        self.usdc = mint.pubkey();
    }

    /// A Token-2022 stand-in stock carrying the real xStocks extensions (CONTRACT.md "Mint recipes").
    fn create_stock(&mut self, symbol: &'static str, _i: usize) {
        use spl_token_2022_interface::extension::{default_account_state, metadata_pointer, pausable, scaled_ui_amount, transfer_hook};
        let mint = Keypair::new();
        let kinds = [
            ExtensionType::PermanentDelegate,
            ExtensionType::Pausable,
            ExtensionType::ScaledUiAmount,
            ExtensionType::TransferHook,
            ExtensionType::DefaultAccountState,
            ExtensionType::MetadataPointer,
        ];
        let space = ExtensionType::try_calculate_account_len::<Mint>(&kinds).unwrap();
        let lamports = self.svm.minimum_balance_for_rent_exemption(space);
        let m = mint.pubkey();
        let issuer = self.issuer.pubkey();
        let ixs = vec![
            system::create_account(&self.gas.pubkey(), &m, lamports, space as u64, &TOKEN_2022),
            spl_token_2022_interface::instruction::initialize_permanent_delegate(&TOKEN_2022, &m, &issuer).unwrap(),
            pausable::instruction::initialize(&TOKEN_2022, &m, &issuer).unwrap(),
            scaled_ui_amount::instruction::initialize(&TOKEN_2022, &m, Some(issuer), 1.003).unwrap(),
            // The real mints have a transfer hook extension with no program set.
            transfer_hook::instruction::initialize(&TOKEN_2022, &m, Some(issuer), None).unwrap(),
            default_account_state::instruction::initialize_default_account_state(&TOKEN_2022, &m, &AccountState::Initialized).unwrap(),
            metadata_pointer::instruction::initialize(&TOKEN_2022, &m, Some(issuer), None).unwrap(),
            // Mint authority is mock_swap's PDA; the issuer holds the freeze authority.
            spl_token_2022_interface::instruction::initialize_mint2(&TOKEN_2022, &m, &self.mock_authority, Some(&issuer), DECIMALS_STOCK).unwrap(),
        ];
        self.send_gas(&ixs, &[&mint]).unwrap();
        self.stocks.push(Stock { symbol, mint: m, price: price_pda(&m) });
    }

    /// The issuer pauses a stock mint (the real xStocks mints are pausable).
    pub fn pause_mint(&mut self, stock: usize) -> TxResult {
        use spl_token_2022_interface::extension::pausable;
        let ix = pausable::instruction::pause(&TOKEN_2022, &self.stocks[stock].mint, &self.issuer.pubkey(), &[]).unwrap();
        let issuer = self.issuer.insecure_clone();
        self.send_gas(&[ix], &[&issuer])
    }

    // ---- token helpers ------------------------------------------------------

    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        match self.svm.get_account(token_account) {
            Some(a) if a.data.len() >= 72 => u64::from_le_bytes(a.data[64..72].try_into().unwrap()),
            _ => 0,
        }
    }

    pub fn usdc_ata(&self, wallet: &Pubkey) -> Pubkey {
        ata(wallet, &self.usdc, &TOKEN)
    }
    pub fn stock_ata(&self, wallet: &Pubkey, stock: usize) -> Pubkey {
        ata(wallet, &self.stocks[stock].mint, &TOKEN_2022)
    }

    /// Give `wallet` a USDC token account holding `amount` micro-USDC.
    pub fn fund_usdc(&mut self, wallet: &Pubkey, amount: u64) {
        let dest = self.usdc_ata(wallet);
        let faucet = self.faucet.insecure_clone();
        let ixs = [
            create_ata(&self.gas.pubkey(), wallet, &self.usdc, &TOKEN),
            spl_token_interface::instruction::mint_to(&TOKEN, &self.usdc, &dest, &faucet.pubkey(), &[], amount).unwrap(),
        ];
        self.send_gas(&ixs, &[&faucet]).unwrap();
    }

    // ---- program instructions ----------------------------------------------

    fn vault_ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
        Instruction { program_id: VAULT_ID, accounts: accounts.to_account_metas(None), data: data.data() }
    }

    pub fn init_config(&mut self) {
        let ix = Self::vault_ix(
            pacer_vault::accounts::InitConfig {
                admin: self.admin.pubkey(),
                payer: self.gas.pubkey(),
                config: self.config,
                usdc_mint: self.usdc,
                system_program: SYSTEM,
            },
            pacer_vault::instruction::InitConfig {
                args: pacer_vault::InitConfigArgs {
                    keeper: self.keeper.pubkey(),
                    oracle_authority: self.oracle.pubkey(),
                    swap_program: SWAP_ID,
                    period_seconds: PERIOD as u32,
                    min_trade: MIN_TRADE,
                    max_rate_per_period: MAX_RATE,
                    max_slippage_bps: SLIPPAGE_BPS,
                    max_price_age_secs: MAX_AGE as u32,
                    max_withdraw_delay_secs: MAX_DELAY,
                    withdraw_window_secs: WINDOW,
                    stock_mints: self.stocks.iter().map(|s| s.mint).collect(),
                },
            },
        );
        let admin = self.admin.insecure_clone();
        self.send_gas(&[ix], &[&admin]).unwrap();
    }

    pub fn ix_init_price(&self, mint: Pubkey) -> Instruction {
        Self::vault_ix(
            pacer_vault::accounts::InitPrice {
                admin: self.admin.pubkey(),
                payer: self.gas.pubkey(),
                config: self.config,
                mint,
                price: price_pda(&mint),
                system_program: SYSTEM,
            },
            pacer_vault::instruction::InitPrice {},
        )
    }

    pub fn ix_update_price(&self, signer: &Pubkey, stock: usize, price: u64) -> Instruction {
        Self::vault_ix(
            pacer_vault::accounts::UpdatePrice { oracle: *signer, config: self.config, price: self.stocks[stock].price },
            pacer_vault::instruction::UpdatePrice { price_micro_usdc: price },
        )
    }

    pub fn set_price(&mut self, stock: usize, price: u64) -> TxResult {
        let oracle = self.oracle.insecure_clone();
        let ix = self.ix_update_price(&oracle.pubkey(), stock, price);
        self.send_gas(&[ix], &[&oracle])
    }

    /// Refresh every price so none is stale (call after warping).
    pub fn refresh_prices(&mut self) {
        for i in 0..self.stocks.len() {
            self.set_price(i, PRICES[i]).unwrap();
        }
    }

    pub fn new_user(&mut self, usdc: u64) -> User {
        let user = User { owner: Keypair::new(), destination: Keypair::new() };
        self.fund_usdc(&user.owner.pubkey(), usdc);
        user
    }

    pub fn mints(&self, idx: &[usize]) -> Vec<Pubkey> {
        idx.iter().map(|&i| self.stocks[i].mint).collect()
    }

    pub fn ix_create_vault(&self, u: &User, rate: u64, stocks: &[usize], delay: u32) -> Instruction {
        let vault = vault_pda(&u.owner.pubkey());
        Self::vault_ix(
            pacer_vault::accounts::CreateVault {
                owner: u.owner.pubkey(),
                payer: self.gas.pubkey(),
                config: self.config,
                vault,
                usdc_mint: self.usdc,
                usdc_vault_ata: self.usdc_ata(&vault),
                usdc_token_program: TOKEN,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
            },
            pacer_vault::instruction::CreateVault {
                args: pacer_vault::CreateVaultArgs {
                    withdrawal_destination: u.destination.pubkey(),
                    rate_per_period: rate,
                    mints: self.mints(stocks),
                    withdraw_delay_secs: delay,
                },
            },
        )
    }

    pub fn create_vault(&mut self, u: &User, rate: u64, stocks: &[usize]) -> TxResult {
        self.create_vault_with_delay(u, rate, stocks, 0)
    }

    pub fn create_vault_with_delay(&mut self, u: &User, rate: u64, stocks: &[usize], delay: u32) -> TxResult {
        let ix = self.ix_create_vault(u, rate, stocks, delay);
        let owner = u.owner.insecure_clone();
        self.send_gas(&[ix], &[&owner])
    }

    pub fn deposit(&mut self, u: &User, amount: u64) -> TxResult {
        let vault = vault_pda(&u.owner.pubkey());
        let ix = Self::vault_ix(
            pacer_vault::accounts::Deposit {
                owner: u.owner.pubkey(),
                config: self.config,
                vault,
                usdc_mint: self.usdc,
                owner_usdc: self.usdc_ata(&u.owner.pubkey()),
                usdc_vault_ata: self.usdc_ata(&vault),
                usdc_token_program: TOKEN,
            },
            pacer_vault::instruction::Deposit { amount },
        );
        let owner = u.owner.insecure_clone();
        self.send_gas(&[ix], &[&owner])
    }

    pub fn ix_buy(&self, keeper: &Pubkey, owner: &Pubkey, stock: usize, usdc_in: u64, min_out: u64) -> Instruction {
        let vault = vault_pda(owner);
        Self::vault_ix(
            pacer_vault::accounts::Buy {
                keeper: *keeper,
                payer: self.gas.pubkey(),
                config: self.config,
                vault,
                price: self.stocks[stock].price,
                usdc_mint: self.usdc,
                stock_mint: self.stocks[stock].mint,
                usdc_vault_ata: self.usdc_ata(&vault),
                stock_vault_ata: self.stock_ata(&vault, stock),
                swap_program: SWAP_ID,
                treasury_usdc: self.treasury,
                mock_authority: self.mock_authority,
                usdc_token_program: TOKEN,
                stock_token_program: TOKEN_2022,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
            },
            pacer_vault::instruction::Buy { usdc_in, min_out },
        )
    }

    /// The keeper buys with a correct `min_out` (the floor at the current oracle price).
    pub fn buy(&mut self, owner: &Pubkey, stock: usize, usdc_in: u64) -> TxResult {
        let min_out = self.floor_for(stock, usdc_in);
        self.buy_raw(owner, stock, usdc_in, min_out)
    }

    pub fn buy_raw(&mut self, owner: &Pubkey, stock: usize, usdc_in: u64, min_out: u64) -> TxResult {
        let keeper = self.keeper.insecure_clone();
        let ix = self.ix_buy(&keeper.pubkey(), owner, stock, usdc_in, min_out);
        self.send_gas(&[ix], &[&keeper])
    }

    /// The same maths as the program: quote at the oracle price, less the slippage.
    pub fn floor_for(&self, stock: usize, usdc_in: u64) -> u64 {
        let quoted = pacer_vault::math::quote_out(usdc_in, PRICES[stock], DECIMALS_STOCK).unwrap();
        pacer_vault::math::slippage_floor(quoted, SLIPPAGE_BPS)
    }

    pub fn ix_set_rules(&self, signer: &Pubkey, owner: &Pubkey, rate: u64, stocks: &[usize], paused: bool) -> Instruction {
        Self::vault_ix(
            pacer_vault::accounts::OwnerVault { owner: *signer, config: self.config, vault: vault_pda(owner) },
            pacer_vault::instruction::SetRules { rate_per_period: rate, mints: self.mints(stocks), paused },
        )
    }

    pub fn set_rules(&mut self, u: &User, rate: u64, stocks: &[usize], paused: bool) -> TxResult {
        let owner = u.owner.insecure_clone();
        let ix = self.ix_set_rules(&owner.pubkey(), &owner.pubkey(), rate, stocks, paused);
        self.send_gas(&[ix], &[&owner])
    }

    /// `signer` signs as the owner of `owner`'s vault (the keeper does this to prove it is refused).
    pub fn ix_withdraw(&self, signer: &Pubkey, owner: &Pubkey, destination: &Pubkey, mint: &Pubkey, program: &Pubkey, amount: u64) -> Instruction {
        let vault = vault_pda(owner);
        Self::vault_ix(
            pacer_vault::accounts::Withdraw {
                owner: *signer,
                payer: self.gas.pubkey(),
                config: self.config,
                vault,
                withdrawal_destination: *destination,
                mint: *mint,
                vault_ata: ata(&vault, mint, program),
                destination_ata: ata(destination, mint, program),
                token_program: *program,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
            },
            pacer_vault::instruction::Withdraw { amount },
        )
    }

    pub fn withdraw_usdc(&mut self, u: &User, amount: u64) -> TxResult {
        let owner = u.owner.insecure_clone();
        let ix = self.ix_withdraw(&owner.pubkey(), &owner.pubkey(), &u.destination.pubkey(), &self.usdc.clone(), &TOKEN, amount);
        self.send_gas(&[ix], &[&owner])
    }

    pub fn withdraw_stock(&mut self, u: &User, stock: usize, amount: u64) -> TxResult {
        let owner = u.owner.insecure_clone();
        let mint = self.stocks[stock].mint;
        let ix = self.ix_withdraw(&owner.pubkey(), &owner.pubkey(), &u.destination.pubkey(), &mint, &TOKEN_2022, amount);
        self.send_gas(&[ix], &[&owner])
    }

    pub fn vault_state(&self, owner: &Pubkey) -> pacer_vault::UserVault {
        use anchor_lang::AccountDeserialize;
        let acct = self.svm.get_account(&vault_pda(owner)).expect("vault account");
        pacer_vault::UserVault::try_deserialize(&mut acct.data.as_slice()).unwrap()
    }

    pub fn config_state(&self) -> pacer_vault::GlobalConfig {
        use anchor_lang::AccountDeserialize;
        let acct = self.svm.get_account(&self.config).expect("config account");
        pacer_vault::GlobalConfig::try_deserialize(&mut acct.data.as_slice()).unwrap()
    }

    /// Warp whole periods and refresh prices so they are not stale.
    pub fn advance_periods(&mut self, n: i64) {
        self.warp(n * PERIOD);
        self.refresh_prices();
    }
}

/// The custom error code Anchor assigns to a `VaultError` (6000 + declaration index).
pub fn code(e: pacer_vault::errors::VaultError) -> u32 {
    e.into()
}

/// True if the failed transaction ended in exactly this custom program error.
pub fn failed_with(res: &TxResult, e: pacer_vault::errors::VaultError) -> bool {
    use solana_message::compiled_instruction as _;
    match res {
        Err(f) => format!("{:?}", f.err).contains(&format!("Custom({})", code(e))),
        Ok(_) => false,
    }
}

// ---- more builders: admin, intent, delay, withdraw-everything, odd mints -----------

impl Env {
    pub fn ix_set_halt(&self, signer: &Pubkey, halted: bool) -> Instruction {
        Self::vault_ix(
            pacer_vault::accounts::AdminConfig { admin: *signer, config: self.config },
            pacer_vault::instruction::SetHalt { halted },
        )
    }

    pub fn ix_set_authorities(&self, signer: &Pubkey, keeper: Pubkey, oracle: Pubkey) -> Instruction {
        Self::vault_ix(
            pacer_vault::accounts::AdminConfig { admin: *signer, config: self.config },
            pacer_vault::instruction::SetAuthorities { keeper, oracle_authority: oracle },
        )
    }

    pub fn set_halt(&mut self, halted: bool) -> TxResult {
        let admin = self.admin.insecure_clone();
        let ix = self.ix_set_halt(&admin.pubkey(), halted);
        self.send_gas(&[ix], &[&admin])
    }

    pub fn ix_record_intent(&self, signer: &Pubkey, owner: &Pubkey) -> Instruction {
        Self::vault_ix(
            pacer_vault::accounts::RecordIntent { keeper: *signer, config: self.config, vault: vault_pda(owner) },
            pacer_vault::instruction::RecordIntent { intent_hash: [7u8; 32], model_id: [9u8; 16] },
        )
    }

    /// `signer` signs as the owner of `owner`'s vault (the keeper does this to prove it is refused).
    fn owner_vault(&self, signer: &Pubkey, owner: &Pubkey) -> pacer_vault::accounts::OwnerVault {
        pacer_vault::accounts::OwnerVault { owner: *signer, config: self.config, vault: vault_pda(owner) }
    }
    pub fn ix_request_withdraw(&self, signer: &Pubkey, owner: &Pubkey) -> Instruction {
        Self::vault_ix(self.owner_vault(signer, owner), pacer_vault::instruction::RequestWithdraw {})
    }
    pub fn ix_cancel_withdraw(&self, signer: &Pubkey, owner: &Pubkey) -> Instruction {
        Self::vault_ix(self.owner_vault(signer, owner), pacer_vault::instruction::CancelWithdraw {})
    }
    pub fn ix_set_delay(&self, signer: &Pubkey, owner: &Pubkey, secs: u32) -> Instruction {
        Self::vault_ix(self.owner_vault(signer, owner), pacer_vault::instruction::SetWithdrawDelay { new_delay_secs: secs })
    }

    /// Sign one owner-only instruction as the vault owner.
    pub fn as_owner(&mut self, u: &User, ix: Instruction) -> TxResult {
        let owner = u.owner.insecure_clone();
        self.send_gas(&[ix], &[&owner])
    }

    /// Withdraw EVERYTHING the vault holds (USDC and every stock with a balance,
    /// including stocks no longer chosen) in one transaction, one `withdraw` per mint.
    pub fn withdraw_everything(&mut self, u: &User) -> TxResult {
        let ixs = self.withdraw_all_ixs(u);
        let owner = u.owner.insecure_clone();
        self.send_gas(&ixs, &[&owner])
    }

    pub fn withdraw_all_ixs(&self, u: &User) -> Vec<Instruction> {
        let o = u.owner.pubkey();
        let vault = vault_pda(&o);
        let d = u.destination.pubkey();
        let mut ixs = vec![];
        let usdc = self.balance(&self.usdc_ata(&vault));
        if usdc > 0 {
            ixs.push(self.ix_withdraw(&o, &o, &d, &self.usdc, &TOKEN, usdc));
        }
        for i in 0..self.stocks.len() {
            let bal = self.balance(&self.stock_ata(&vault, i));
            if bal > 0 {
                ixs.push(self.ix_withdraw(&o, &o, &d, &self.stocks[i].mint, &TOKEN_2022, bal));
            }
        }
        ixs
    }

    /// Serialized size of a transaction (the network limit is 1,232 bytes).
    pub fn tx_size(&self, ixs: &[Instruction], extra: &[&Keypair]) -> usize {
        let gas = self.gas.insecure_clone();
        let mut signers: Vec<&Keypair> = vec![&gas];
        signers.extend(extra.iter().copied());
        let tx = Transaction::new_signed_with_payer(ixs, Some(&gas.pubkey()), &signers, self.svm.latest_blockhash());
        1 + 64 * tx.signatures.len() + tx.message.serialize().len()
    }

    /// A mint that is NOT in the allowlist (a legacy token mint), plus the vault's token account for it.
    pub fn spam_mint_for_vault(&mut self, owner: &Pubkey) -> Pubkey {
        let mint = Keypair::new();
        let lamports = self.svm.minimum_balance_for_rent_exemption(82);
        let ixs = [
            system::create_account(&self.gas.pubkey(), &mint.pubkey(), lamports, 82, &TOKEN),
            spl_token_interface::instruction::initialize_mint2(&TOKEN, &mint.pubkey(), &self.faucet.pubkey(), None, 6).unwrap(),
            create_ata(&self.gas.pubkey(), &vault_pda(owner), &mint.pubkey(), &TOKEN),
        ];
        self.send_gas(&ixs, &[&mint]).unwrap();
        mint.pubkey()
    }

    /// Try to run `init_config` again with these args (used for validation failures).
    pub fn try_init_config(&mut self, args: pacer_vault::InitConfigArgs, usdc_mint: Pubkey, config: Pubkey) -> TxResult {
        let ix = Self::vault_ix(
            pacer_vault::accounts::InitConfig {
                admin: self.admin.pubkey(),
                payer: self.gas.pubkey(),
                config,
                usdc_mint,
                system_program: SYSTEM,
            },
            pacer_vault::instruction::InitConfig { args },
        );
        let admin = self.admin.insecure_clone();
        self.send_gas(&[ix], &[&admin])
    }

    pub fn good_args(&self) -> pacer_vault::InitConfigArgs {
        pacer_vault::InitConfigArgs {
            keeper: self.keeper.pubkey(),
            oracle_authority: self.oracle.pubkey(),
            swap_program: SWAP_ID,
            period_seconds: PERIOD as u32,
            min_trade: MIN_TRADE,
            max_rate_per_period: MAX_RATE,
            max_slippage_bps: SLIPPAGE_BPS,
            max_price_age_secs: MAX_AGE as u32,
            max_withdraw_delay_secs: MAX_DELAY,
            withdraw_window_secs: WINDOW,
            stock_mints: self.stocks.iter().map(|s| s.mint).collect(),
        }
    }

    /// A vault with `usdc` deposited and `periods` of pace unlocked, ready to buy.
    pub fn ready_vault(&mut self, rate: u64, stocks: &[usize], usdc: u64, periods: i64) -> User {
        let u = self.new_user(usdc);
        self.create_vault(&u, rate, stocks).unwrap();
        self.deposit(&u, usdc).unwrap();
        self.advance_periods(periods);
        u
    }
}

impl Env {
    /// Like `ready_vault`, for worlds where prices were not refreshed by `advance_periods`.
    pub fn ready_vault_bare(&mut self, rate: u64, stocks: &[usize], usdc: u64, periods: i64) -> User {
        let u = self.new_user(usdc);
        self.create_vault(&u, rate, stocks).unwrap();
        self.deposit(&u, usdc).unwrap();
        self.warp(periods * PERIOD); // no price refresh on purpose
        u
    }
}
