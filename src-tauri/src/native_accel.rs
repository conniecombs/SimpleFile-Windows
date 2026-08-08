//! Small native byte-scanning helpers for backend hot paths.
//!
//! The public functions in this module are safe and preserve the existing Rust
//! semantics. Architecture-specific assembly stays private and falls back to
//! portable Rust on non-x64 targets.

pub(crate) fn contains_case_insensitive(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }

    if haystack.is_ascii() && needle.is_ascii() {
        return contains_ascii_case_insensitive(haystack.as_bytes(), needle.as_bytes());
    }

    haystack.to_lowercase().contains(&needle.to_lowercase())
}

pub(crate) fn contains_zero_byte(bytes: &[u8]) -> bool {
    find_byte(bytes, 0).is_some()
}

fn contains_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    debug_assert!(!needle.is_empty());
    debug_assert!(haystack.is_ascii());
    debug_assert!(needle.is_ascii());

    if needle.len() > haystack.len() {
        return false;
    }

    let mut offset = 0usize;
    while offset + needle.len() <= haystack.len() {
        let Some(relative) = find_ascii_case_byte(&haystack[offset..], needle[0]) else {
            return false;
        };
        let candidate = offset + relative;
        if candidate + needle.len() > haystack.len() {
            return false;
        }
        if haystack[candidate..candidate + needle.len()].eq_ignore_ascii_case(needle) {
            return true;
        }
        offset = candidate + 1;
    }

    false
}

fn find_ascii_case_byte(bytes: &[u8], byte: u8) -> Option<usize> {
    let lower = byte.to_ascii_lowercase();
    let upper = byte.to_ascii_uppercase();
    if lower == upper {
        find_byte(bytes, lower)
    } else {
        find_first_of_two(bytes, lower, upper)
    }
}

fn find_byte(bytes: &[u8], byte: u8) -> Option<usize> {
    find_first_of_two(bytes, byte, byte)
}

fn find_first_of_two(bytes: &[u8], first: u8, second: u8) -> Option<usize> {
    #[cfg(target_arch = "x86_64")]
    {
        // SAFETY: the assembly reads at most `bytes.len()` bytes from the slice
        // pointer and returns either a valid in-slice offset or `None`.
        unsafe { find_first_of_two_x64(bytes, first, second) }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        bytes
            .iter()
            .position(|&byte| byte == first || byte == second)
    }
}

#[cfg(target_arch = "x86_64")]
unsafe fn find_first_of_two_x64(bytes: &[u8], first: u8, second: u8) -> Option<usize> {
    let base = bytes.as_ptr() as usize;
    let cursor = base;
    let remaining = bytes.len();
    let found: usize;

    unsafe {
        core::arch::asm!(
            "test {remaining}, {remaining}",
            "jz 5f",
            "2:",
            "mov {current}, byte ptr [{cursor}]",
            "cmp {current}, {first}",
            "je 4f",
            "cmp {current}, {second}",
            "je 4f",
            "inc {cursor}",
            "dec {remaining}",
            "jnz 2b",
            "5:",
            "mov {found}, -1",
            "jmp 6f",
            "4:",
            "sub {cursor}, {base}",
            "mov {found}, {cursor}",
            "6:",
            cursor = inout(reg) cursor => _,
            remaining = inout(reg) remaining => _,
            base = in(reg) base,
            first = in(reg_byte) first,
            second = in(reg_byte) second,
            current = out(reg_byte) _,
            found = lateout(reg) found,
            options(nostack, readonly)
        );
    }

    (found != usize::MAX).then_some(found)
}

#[cfg(test)]
mod tests {
    use super::{contains_case_insensitive, contains_zero_byte};

    #[test]
    fn ascii_case_insensitive_search_matches_across_case_boundaries() {
        assert!(contains_case_insensitive("Alpha BRAVO charlie", "bravo"));
        assert!(contains_case_insensitive("Alpha BRAVO charlie", "ALPHA"));
        assert!(contains_case_insensitive("Alpha BRAVO charlie", "Charlie"));
        assert!(!contains_case_insensitive("Alpha BRAVO charlie", "delta"));
    }

    #[test]
    fn case_insensitive_search_preserves_unicode_lowercase_semantics() {
        let haystack = "\u{0130}stanbul";
        let needle = "i";
        assert_eq!(
            contains_case_insensitive(haystack, needle),
            haystack.to_lowercase().contains(&needle.to_lowercase())
        );
    }

    #[test]
    fn zero_byte_search_finds_only_actual_nul_bytes() {
        assert!(contains_zero_byte(b"abc\0def"));
        assert!(contains_zero_byte(b"\0prefix"));
        assert!(contains_zero_byte(b"suffix\0"));
        assert!(!contains_zero_byte(b"plain text"));
        assert!(!contains_zero_byte(b""));
    }
}
