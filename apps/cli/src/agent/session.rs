use uuid::Uuid;

pub struct SessionManager;

impl SessionManager {
    pub fn new_session() -> String {
        Uuid::new_v4().to_string()
    }

    pub fn validate_session_id(session_id: &str) -> bool {
        Uuid::parse_str(session_id).is_ok()
    }
}

