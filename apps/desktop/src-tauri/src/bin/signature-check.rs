//! Read-only distribution signature verifier. Does not initialize a Tauri app.
use base64::{engine::general_purpose::STANDARD, Engine};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let artifact = args.next().ok_or("artifact required")?;
    let signature = args.next().ok_or("signature required")?;
    let config = args.next().ok_or("config required")?;
    if args.next().is_some() {
        return Err("unexpected argument".into());
    }
    let config: serde_json::Value = serde_json::from_slice(&std::fs::read(config)?)?;
    let public = String::from_utf8(
        STANDARD.decode(
            config["plugins"]["updater"]["pubkey"]
                .as_str()
                .ok_or("missing public key")?,
        )?,
    )?;
    let signature =
        String::from_utf8(STANDARD.decode(std::fs::read_to_string(signature)?.trim())?)?;
    let signature = minisign_verify::Signature::decode(&signature)?;
    minisign_verify::PublicKey::decode(&public)?.verify(
        &std::fs::read(artifact)?,
        &signature,
        true,
    )?;
    let signed_version = signature
        .trusted_comment()
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"));
    if signed_version != Some(env!("CARGO_PKG_VERSION")) {
        return Err("signed release version mismatch".into());
    }
    println!("verified updater signature");
    Ok(())
}
