use std::io;
use std::process::Stdio;
use tokio::process::{Child, Command};
use crate::t;

// Each process gets its own job. Windows closes it even on process::exit
// and kills yt-dlp together with ffmpeg; the updater process is not in the job.
#[cfg(windows)]
pub struct ProcessTree { _handle: std::sync::Arc<std::os::windows::io::OwnedHandle> }
#[cfg(not(windows))]
pub struct ProcessTree;

#[cfg(windows)]
#[derive(Default)]
struct Jobs {
    stopping: bool,
    handles: Vec<std::sync::Weak<std::os::windows::io::OwnedHandle>>,
}

#[cfg(windows)]
static JOBS: std::sync::LazyLock<std::sync::Mutex<Jobs>> = std::sync::LazyLock::new(Default::default);

impl ProcessTree {
    pub fn attach(child: &Child) -> io::Result<Self> {
        #[cfg(windows)]
        {
            use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
            use windows_sys::Win32::System::JobObjects::*;
            let raw = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if raw.is_null() { return Err(io::Error::last_os_error()); }
            let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if unsafe { SetInformationJobObject(handle.as_raw_handle(), JobObjectExtendedLimitInformation, &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32) } == 0 {
                return Err(io::Error::last_os_error());
            }
            let process = child.raw_handle().ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Process exited before registration"))?;
            if unsafe { AssignProcessToJobObject(handle.as_raw_handle(), process) } == 0 {
                return Err(io::Error::last_os_error());
            }
            let handle = std::sync::Arc::new(handle);
            {
                let mut jobs = JOBS.lock().unwrap_or_else(|e| e.into_inner());
                if jobs.stopping { return Err(io::Error::other("Application is exiting")); }
                jobs.handles.retain(|handle| handle.strong_count() > 0);
                jobs.handles.push(std::sync::Arc::downgrade(&handle));
            }
            resume_child(child.id().ok_or_else(|| io::Error::other("Process has no id"))?)?;
            Ok(Self { _handle: handle })
        }
        #[cfg(not(windows))]
        { let _ = child; Ok(Self) }
    }
}

// Tokio workers; the child process belongs to the awaiting operation.
pub async fn spawn(command: &mut Command) -> Result<(Child, ProcessTree), String> {
    command.kill_on_drop(true).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(0x08000004); // CREATE_NO_WINDOW | CREATE_SUSPENDED
    let mut child = command.spawn().map_err(|e| t!("Не удалось запустить yt-dlp: {}", "Failed to start yt-dlp: {}", e))?;
    match ProcessTree::attach(&child) {
        Ok(tree) => Ok((child, tree)),
        Err(error) => {
            let _ = child.kill().await;
            Err(t!("Не удалось привязать процесс к приложению: {}", "Failed to attach the process to the app: {}", error))
        }
    }
}

#[cfg(windows)]
fn resume_child(pid: u32) -> io::Result<()> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::{Foundation::INVALID_HANDLE_VALUE, System::{Diagnostics::ToolHelp::*, Threading::*}};
    // std closes the main thread handle, so we look up the child's threads via a snapshot.
    let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if raw == INVALID_HANDLE_VALUE { return Err(io::Error::last_os_error()); }
    let snapshot = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut entry: THREADENTRY32 = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of_val(&entry) as u32;
    let mut found = unsafe { Thread32First(snapshot.as_raw_handle(), &mut entry) } != 0;
    let mut resumed = false;
    while found {
        if entry.th32OwnerProcessID == pid {
            let raw = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
            if raw.is_null() { return Err(io::Error::last_os_error()); }
            let thread = unsafe { OwnedHandle::from_raw_handle(raw) };
            if unsafe { ResumeThread(thread.as_raw_handle()) } == u32::MAX { return Err(io::Error::last_os_error()); }
            resumed = true;
        }
        found = unsafe { Thread32Next(snapshot.as_raw_handle(), &mut entry) } != 0;
    }
    if resumed { Ok(()) } else { Err(io::Error::new(io::ErrorKind::NotFound, "Suspended process thread not found")) }
}

// Tauri exit thread: first block new registrations, then terminate the jobs.
pub fn stop_all() {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        let handles: Vec<_> = {
            let mut jobs = JOBS.lock().unwrap_or_else(|e| e.into_inner());
            jobs.stopping = true;
            jobs.handles.iter().filter_map(std::sync::Weak::upgrade).collect()
        };
        for handle in &handles { unsafe { TerminateJobObject(handle.as_raw_handle(), 1); } }
        let until = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while std::time::Instant::now() < until {
            let active = handles.iter().any(|handle| {
                let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { std::mem::zeroed() };
                let ok = unsafe { QueryInformationJobObject(handle.as_raw_handle(), JobObjectBasicAccountingInformation, &mut info as *mut _ as *mut _, std::mem::size_of_val(&info) as u32, std::ptr::null_mut()) };
                ok != 0 && info.ActiveProcesses > 0
            });
            if !active { break; }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}

#[cfg(windows)]
pub fn is_alive(pid: u32) -> bool {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject};
    let raw = unsafe { OpenProcess(0x00100000, 0, pid) }; // SYNCHRONIZE
    if raw.is_null() { return std::io::Error::last_os_error().raw_os_error() == Some(5); }
    let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
    unsafe { WaitForSingleObject(handle.as_raw_handle(), 0) == 258 } // WAIT_TIMEOUT
}

#[cfg(not(windows))]
pub fn is_alive(_pid: u32) -> bool { true }

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use tokio::io::AsyncBufReadExt;

    #[tokio::test]
    async fn dropping_job_kills_an_immediately_spawned_descendant() {
        let script = "$p=Start-Process -FilePath ($PSHOME+'\\powershell.exe') -ArgumentList '-NoProfile -NonInteractive -Command Start-Sleep 60' -WindowStyle Hidden -PassThru; [Console]::WriteLine($p.Id); Start-Sleep 60";
        let (mut child, tree) = spawn(Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", script])).await.unwrap();
        let mut output = tokio::io::BufReader::new(child.stdout.take().unwrap()).lines();
        let line = tokio::time::timeout(std::time::Duration::from_secs(10), output.next_line()).await.unwrap().unwrap().unwrap();
        let descendant: u32 = line.trim().parse().unwrap();
        assert!(is_alive(descendant));
        drop(tree);
        tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await.unwrap().unwrap();
        let until = std::time::Instant::now() + std::time::Duration::from_secs(3);
        while is_alive(descendant) && std::time::Instant::now() < until { tokio::time::sleep(std::time::Duration::from_millis(10)).await; }
        assert!(!is_alive(descendant), "descendant escaped its job");
    }
}
