use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "vargos-cli")]
#[command(about = "Vargos CLI - Interactive terminal interface for Mastra agents", long_about = None)]
pub struct Cli {
    /// Message to send (command mode)
    #[arg(value_name = "MESSAGE", trailing_var_arg = true)]
    pub message: Option<Vec<String>>,

    /// Agent name to use
    #[arg(short, long)]
    pub agent: Option<String>,

    /// Config file path
    #[arg(long)]
    pub config_path: Option<std::path::PathBuf>,

    /// List available agents
    #[arg(long)]
    pub list_agents: bool,

    /// Show agent info
    #[arg(long)]
    pub agent_info: Option<String>,

    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Show version
    Version,
}

