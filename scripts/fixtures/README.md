`rpm-rs-0.16.rpm` is a synthetic, unsigned extraction fixture generated with
Tauri CLI 2.12.1's exact RPM builder dependency, `rpm = 0.16.0`. It contains only
`usr/share/wowthing-ci-rpm-fixture/Unicode 雪 with spaces.txt`, whose content is
`synthetic package fixture\n`. It contains no application executable or secrets.
Its SHA256 is `75c5ebb07e6af824b75674c6822b0c388778edf9a93469199e3fadb51a2df114`.

This builder omits the archive-size tag that Ubuntu 24.04's rpm2cpio 4.18 checks
after copying the archive, yielding exit 1 without a diagnostic. The production
extraction path verifies RPM header/payload digests with `rpm --checksig
--nosignature` before using `bsdtar`. Its Linux regression also corrupts the gzip
CRC and truncates the payload; both must fail before any member is extracted.

To regenerate, create a temporary Cargo project with `rpm = { version =
"=0.16.0", default-features = false, features = ["gzip-compression"] }`, and use
this program with the output RPM path as its argument:

```rust
fn main() {
    let output = std::path::PathBuf::from(std::env::args().nth(1).unwrap());
    let payload = output.with_extension("payload");
    std::fs::write(&payload, "synthetic package fixture\n").unwrap();
    let package = rpm::PackageBuilder::new(
        "wowthing-ci-rpm-fixture", "1.0.0", "MIT", "x86_64", "Synthetic extraction fixture",
    )
    .source_date(1_704_067_200_u32)
    .compression(rpm::CompressionWithLevel::Gzip(6))
    .with_file(&payload, rpm::FileOptions::new(
        "/usr/share/wowthing-ci-rpm-fixture/Unicode 雪 with spaces.txt",
    ))
    .unwrap().build().unwrap();
    package.write(&mut std::fs::File::create(output).unwrap()).unwrap();
    std::fs::remove_file(payload).unwrap();
}
```

Upstream references: [Tauri's locked dependency](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.1/Cargo.lock),
[RPM4.18's size check](https://github.com/rpm-software-management/rpm/blob/rpm-4.18.2-release/rpm2cpio.c#L89),
and [RPM's header/payload digest verification](https://github.com/rpm-software-management/rpm/blob/rpm-4.18.2-release/lib/rpmchecksig.c).
