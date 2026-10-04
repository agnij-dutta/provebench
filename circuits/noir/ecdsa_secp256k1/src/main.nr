// ECDSA secp256k1 signature verification over a 32-byte message hash.
// Public key and hash are public; the signature is private.
fn main(
    pub_key_x: pub [u8; 32],
    pub_key_y: pub [u8; 32],
    signature: [u8; 64],
    message_hash: pub [u8; 32],
) {
    let ok = std::ecdsa_secp256k1::verify_signature(pub_key_x, pub_key_y, signature, message_hash);
    assert(ok);
}
