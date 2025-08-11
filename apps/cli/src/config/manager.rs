use crate::config::types::Config;
use anyhow::{Context, Result};
use dirs;
use std::fs;
use std::path::PathBuf;

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir()
            .context("Failed to find config directory")?
            .join("vargos-cli");
        
        fs::create_dir_all(&config_dir)
            .context("Failed to create config directory")?;

        let config_path = config_dir.join("config.yaml");
        
        Ok(Self { config_path })
    }

    pub fn with_path(config_path: PathBuf) -> Self {
        Self { config_path }
    }

    pub fn load(&self) -> Result<Config> {
        if !self.config_path.exists() {
            let default_config = Config::default();
            self.save(&default_config)?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(&self.config_path)
            .context("Failed to read config file")?;
        
        let mut config: Config = serde_yaml::from_str(&content)
            .context("Failed to parse config file")?;

        // Apply environment variable overrides
        if let Ok(url) = std::env::var("VARGOS_CLI_MASTRA_URL") {
            config.mastra_url = url;
        }
        if let Ok(agent) = std::env::var("VARGOS_CLI_AGENT") {
            config.default_agent = Some(agent);
        }

        Ok(config)
    }

    pub fn save(&self, config: &Config) -> Result<()> {
        let content = serde_yaml::to_string(config)
            .context("Failed to serialize config")?;
        
        fs::write(&self.config_path, content)
            .context("Failed to write config file")?;

        Ok(())
    }

    pub fn config_path(&self) -> &PathBuf {
        &self.config_path
    }
}

