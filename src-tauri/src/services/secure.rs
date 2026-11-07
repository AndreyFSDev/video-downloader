// Cookies are encrypted on disk via DPAPI (CurrentUser): only the same Windows user
// on this machine can decrypt the file. A copy on another PC is useless.

const MAGIC: &[u8; 4] = b"VDC1";

#[cfg(test)]
fn is_protected(data: &[u8]) -> bool {
    data.starts_with(MAGIC)
}

#[cfg(windows)]
pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(plain.len()).map_err(|_| crate::i18n::tr("Слишком большой файл cookies", "Cookies file is too large"))?,
        pbData: plain.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // SAFETY: input points to a live slice for the duration of the call; output is filled
    // by the system, and its buffer is freed by LocalFree inside take_blob.
    let ok = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(crate::t!(
            "Не удалось зашифровать cookies (код {})",
            "Failed to encrypt cookies (code {})",
            std::io::Error::last_os_error().raw_os_error().unwrap_or(-1)
        ));
    }
    let mut data = MAGIC.to_vec();
    data.extend(unsafe { take_blob(output) });
    Ok(data)
}

#[cfg(windows)]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    let Some(payload) = data.strip_prefix(MAGIC.as_slice()) else {
        // The old plaintext file (pre-encryption) is read as is and re-encrypted by the migration.
        return Ok(data.to_vec());
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: payload.len() as u32,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // SAFETY: same as in protect.
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(crate::i18n::tr(
            "Cookies зашифрованы другим пользователем Windows — импортируйте их заново",
            "Cookies were encrypted by another Windows user — import them again",
        ));
    }
    Ok(unsafe { take_blob(output) })
}

#[cfg(windows)]
unsafe fn take_blob(blob: windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB) -> Vec<u8> {
    if blob.pbData.is_null() {
        return Vec::new();
    }
    let bytes = std::slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec();
    windows_sys::Win32::Foundation::LocalFree(blob.pbData as _);
    bytes
}

// Outside Windows the program is not released; the stub keeps the tests portable.
#[cfg(not(windows))]
pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut data = MAGIC.to_vec();
    data.extend_from_slice(plain);
    Ok(data)
}

#[cfg(not(windows))]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.strip_prefix(MAGIC.as_slice()).unwrap_or(data).to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_hides_plaintext() {
        let secret = b".boosty.to\tTRUE\t/\tTRUE\t0\tauth\tsecret-token\n";
        let sealed = protect(secret).unwrap();
        assert!(is_protected(&sealed));
        #[cfg(windows)]
        assert!(!sealed.windows(12).any(|w| w == b"secret-token"));
        assert_eq!(unprotect(&sealed).unwrap(), secret);
    }

    #[test]
    fn legacy_plaintext_passes_through() {
        assert_eq!(unprotect(b"plain").unwrap(), b"plain");
    }
}
