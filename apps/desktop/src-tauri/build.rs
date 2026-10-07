fn main() {
    println!("cargo:rerun-if-env-changed=WOWTHING_DISTRIBUTION");
    if std::env::var_os("WOWTHING_DISTRIBUTION").is_some() {
        assert!(
            std::env::var_os("CARGO_FEATURE_SMOKE_TEST").is_none()
                && std::env::var_os("CARGO_FEATURE_INTEGRATION_TEST").is_none(),
            "distribution builds cannot contain an automation harness"
        );
    }
    tauri_build::build()
}
