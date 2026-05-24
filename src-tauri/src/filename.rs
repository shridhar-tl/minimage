//! Output filename templating.
//!
//! Tokens are `{...}` placeholders. A template may contain `/` to create
//! sub-folders. The result is sanitized so it can never escape the output dir.

use chrono::{Datelike, Local, Timelike};

pub struct NameCtx<'a> {
    pub name: &'a str, // original stem, no extension
    pub origext: &'a str,
    pub ext: &'a str, // output extension (no dot)
    pub width: u32,
    pub height: u32,
    pub orig_width: u32,
    pub orig_height: u32,
    pub format: &'a str,
    pub quality: u8,
    /// WebP/AVIF encoding effort (1–9), or None if not applicable.
    pub effort: Option<u8>,
    /// PNG compression level (0–6), or None if not applicable.
    pub png_level: Option<u8>,
    /// True when this output is encoded losslessly.
    pub lossless: bool,
    pub size_label: &'a str,
    pub index: usize,
}

impl NameCtx<'_> {
    /// Compact, filename-safe encoding tag — see `encTag` in tokens.ts.
    fn enc_tag(&self) -> String {
        match self.format {
            "png" => {
                if self.lossless {
                    "lossless".into()
                } else {
                    format!("l{}", self.png_level.unwrap_or(2))
                }
            }
            "webp" | "avif" => {
                if self.lossless {
                    "lossless".into()
                } else {
                    format!("q{}e{}", self.quality, self.effort.unwrap_or(4))
                }
            }
            "jpeg" => format!("q{}", self.quality),
            _ => String::new(),
        }
    }
}

pub fn render_filename(template: &str, ctx: &NameCtx) -> String {
    let now = Local::now();
    let two = |n: u32| format!("{n:02}");
    let h12 = {
        let h = now.hour() % 12;
        if h == 0 {
            12
        } else {
            h
        }
    };

    let opt = |v: Option<u8>| v.map(|n| n.to_string()).unwrap_or_default();

    // Longest tokens first so e.g. {MM} is handled before {M}.
    let pairs: [(&str, String); 30] = [
        ("{origheight}", ctx.orig_height.to_string()),
        ("{origwidth}", ctx.orig_width.to_string()),
        ("{sizelabel}", ctx.size_label.to_string()),
        ("{pnglevel}", opt(ctx.png_level)),
        ("{lossless}", if ctx.lossless { "lossless".into() } else { "lossy".into() }),
        ("{origext}", ctx.origext.to_string()),
        ("{quality}", ctx.quality.to_string()),
        ("{effort}", opt(ctx.effort)),
        ("{height}", ctx.height.to_string()),
        ("{format}", ctx.format.to_string()),
        ("{index}", ctx.index.to_string()),
        ("{width}", ctx.width.to_string()),
        ("{label}", ctx.size_label.to_string()),
        ("{name}", ctx.name.to_string()),
        ("{YYYY}", now.year().to_string()),
        ("{enc}", ctx.enc_tag()),
        ("{idx}", format!("{:03}", ctx.index)),
        ("{ext}", ctx.ext.to_string()),
        ("{ow}", ctx.orig_width.to_string()),
        ("{oh}", ctx.orig_height.to_string()),
        ("{YY}", two((now.year().rem_euclid(100)) as u32)),
        ("{MM}", two(now.month())),
        ("{dd}", two(now.day())),
        ("{HH}", two(now.hour())),
        ("{hh}", two(h12)),
        ("{mm}", two(now.minute())),
        ("{ss}", two(now.second())),
        ("{w}", ctx.width.to_string()),
        ("{h}", ctx.height.to_string()),
        ("{M}", now.month().to_string()),
    ];

    let mut out = template.to_string();
    if out.trim().is_empty() {
        out = "{name}_{width}x{height}.{ext}".to_string();
    }
    for (token, value) in pairs.iter() {
        if out.contains(token) {
            out = out.replace(token, value);
        }
    }
    // {d} last (substring of {dd}/{idx}, but those are already gone).
    out = out.replace("{d}", &now.day().to_string());

    sanitize_relpath(&out)
}

fn sanitize_segment(seg: &str) -> String {
    let mut s: String = seg
        .chars()
        .map(|c| {
            if "<>:\"|?*".contains(c) || (c as u32) < 0x20 {
                '_'
            } else {
                c
            }
        })
        .collect();
    while s.ends_with('.') || s.ends_with(' ') {
        s.pop();
    }
    if s.is_empty() {
        s.push('_');
    }
    s
}

/// Normalize separators and sanitize each path component (blocks `..` traversal).
fn sanitize_relpath(p: &str) -> String {
    let p = p.replace('\\', "/");
    let parts: Vec<String> = p
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .map(sanitize_segment)
        .collect();
    parts.join("/")
}
