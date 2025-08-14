use anyhow;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    Config(#[from] anyhow::Error),
    
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("Agent error: {0}")]
    Agent(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

