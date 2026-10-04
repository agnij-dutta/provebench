// SHA-256 of a 1024-byte private message, digest is public.
global LEN: u32 = 1024;

fn main(msg: [u8; LEN], digest: pub [u8; 32]) {
    let out = sha256::digest(msg);
    assert(out == digest);
}
