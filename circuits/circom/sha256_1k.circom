pragma circom 2.1.6;
// SHA-256 of a 1024-byte private message, digest (32 bytes) is public.
include "../../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template Sha256Bytes(LEN) {
    signal input msg[LEN];
    signal input digest[32];

    component sha = Sha256(LEN * 8);
    component n2b[LEN];
    for (var i = 0; i < LEN; i++) {
        n2b[i] = Num2Bits(8);
        n2b[i].in <== msg[i];
        for (var j = 0; j < 8; j++) {
            // circomlib Sha256 expects big-endian bits per byte
            sha.in[i * 8 + j] <== n2b[i].out[7 - j];
        }
    }
    component b2n[32];
    for (var i = 0; i < 32; i++) {
        b2n[i] = Bits2Num(8);
        for (var j = 0; j < 8; j++) {
            b2n[i].in[7 - j] <== sha.out[i * 8 + j];
        }
        b2n[i].out === digest[i];
    }
}

component main { public [digest] } = Sha256Bytes(1024);
