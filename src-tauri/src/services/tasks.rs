use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tokio::sync::oneshot;

struct Task {
    sender: Option<oneshot::Sender<()>>,
    receiver: Option<oneshot::Receiver<()>>,
}

static TASKS: LazyLock<Mutex<HashMap<String, Task>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

// Commands and workers hold the mutex only for short operations on the map.
pub fn prepare(id: &str) -> Result<(), String> {
    let mut tasks = TASKS.lock().unwrap_or_else(|e| e.into_inner());
    if id.is_empty() || tasks.contains_key(id) { return Err(crate::i18n::tr("Задача уже существует или не задана", "Task already exists or has no id")); }
    let (sender, receiver) = oneshot::channel();
    tasks.insert(id.into(), Task { sender: Some(sender), receiver: Some(receiver) });
    Ok(())
}

pub fn claim(id: &str) -> Result<oneshot::Receiver<()>, String> {
    TASKS.lock().unwrap_or_else(|e| e.into_inner()).get_mut(id)
        .and_then(|task| task.receiver.take()).ok_or_else(|| crate::i18n::tr("Задача не подготовлена или уже запущена", "Task is not prepared or already running"))
}

pub fn cancel(id: &str) {
    if let Some(sender) = TASKS.lock().unwrap_or_else(|e| e.into_inner()).get_mut(id).and_then(|task| task.sender.take()) {
        let _ = sender.send(());
    }
}

pub fn release(id: &str) {
    TASKS.lock().unwrap_or_else(|e| e.into_inner()).remove(id);
}

pub struct Registration(pub String);
impl Drop for Registration {
    fn drop(&mut self) { release(&self.0); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancellation_before_claim_is_retained() {
        let id = uuid::Uuid::new_v4().to_string();
        prepare(&id).unwrap();
        assert!(prepare(&id).is_err());
        cancel(&id);
        let receiver = claim(&id).unwrap();
        assert!(claim(&id).is_err());
        assert!(receiver.await.is_ok());
        release(&id);
    }

    #[tokio::test]
    async fn release_cancels_an_owned_operation() {
        let id = uuid::Uuid::new_v4().to_string();
        prepare(&id).unwrap();
        let receiver = claim(&id).unwrap();
        release(&id);
        assert!(receiver.await.is_err());
        cancel(&id);
    }
}
