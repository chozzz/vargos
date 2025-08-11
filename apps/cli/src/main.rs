mod agent;
mod cli;
mod commands;
mod config;
mod state;
mod ui;
mod utils;

use anyhow::Result;
use clap::Parser;
use config::{Config, ConfigManager};
use state::AppState;
use std::io::Read;

use crate::cli::Cli;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Load configuration
    let config_manager = if let Some(config_path) = cli.config_path {
        ConfigManager::with_path(config_path)
    } else {
        ConfigManager::new()?
    };

    let config = config_manager.load()?;

    // Initialize state (for future use in interactive mode)
    let _state = AppState::new(config.mastra_url.clone());

    // Handle CLI commands
    if cli.list_agents {
        return handle_list_agents(&config.mastra_url).await;
    }

    if let Some(agent_name) = cli.agent_info {
        return handle_agent_info(&config.mastra_url, &agent_name).await;
    }

    // Command mode: if message is provided or stdin available, send and exit
    let message = if let Some(msg_parts) = cli.message {
        if msg_parts.is_empty() {
            None
        } else {
            Some(msg_parts.join(" "))
        }
    } else if atty::isnt(atty::Stream::Stdin) {
        // Read from stdin if piped
        let mut input = String::new();
        std::io::stdin().read_to_string(&mut input)?;
        let trimmed = input.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    } else {
        None
    };

    if let Some(msg) = message {
        return handle_command_mode(&config, &msg, cli.agent.as_deref()).await;
    }

    // Interactive mode (to be implemented in later phases)
    println!("Interactive mode not yet implemented. Use --help for available commands.");
    Ok(())
}

async fn handle_list_agents(base_url: &str) -> Result<()> {
    use crate::agent::AgentDiscovery;
    
    let discovery = AgentDiscovery::new(base_url.to_string());
    let agents = discovery.list_agents().await?;
    
    println!("Available agents:");
    for agent in agents {
        println!("  - {}: {}", agent.name, agent.description);
    }
    
    Ok(())
}

async fn handle_agent_info(base_url: &str, agent_name: &str) -> Result<()> {
    use crate::agent::AgentDiscovery;
    
    let discovery = AgentDiscovery::new(base_url.to_string());
    let agent = discovery.get_agent(agent_name).await?;
    
    println!("Agent: {}", agent.name);
    println!("Description: {}", agent.description);
    if let Some(tools) = agent.tools {
        println!("Tools: {}", tools.join(", "));
    }
    
    Ok(())
}

async fn handle_command_mode(
    config: &Config,
    message: &str,
    agent_name: Option<&str>,
) -> Result<()> {
    use crate::agent::AgentClient;
    
    if message.is_empty() {
        return Err(anyhow::anyhow!("Message cannot be empty. Please provide a message to send."));
    }
    
    let agent = agent_name
        .map(|s| s.to_string())
        .or_else(|| config.default_agent.clone())
        .ok_or_else(|| anyhow::anyhow!("No agent specified. Use --agent or set default_agent in config"))?;

    let client = AgentClient::new(config.mastra_url.clone());
    let response = client.chat(&agent, message, config.default_session.as_deref()).await?;
    
    if !response.is_empty() {
        println!("{}", response);
    }
    
    Ok(())
}
