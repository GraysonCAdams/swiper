# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please do the following:

1. **DO NOT** open a public issue
2. Email security concerns to: [Your email or create a security contact]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge your email within 48 hours and send a detailed response within 7 days indicating the next steps.

## Security Best Practices

This plugin follows these security practices:

- ✅ No data transmission to external servers
- ✅ All processing happens locally
- ✅ No use of `innerHTML` or `eval()`
- ✅ DOM API used for all dynamic content
- ✅ No collection of user data
- ✅ Settings stored locally in Obsidian

## Update Policy

- Security patches are released as soon as possible
- Users are notified via GitHub releases
- Critical vulnerabilities are disclosed after a patch is available

## Scope

This security policy applies to:

- The Swiper plugin code
- Build scripts and dependencies
- Documentation that affects security

Out of scope:

- Obsidian app itself (report to Obsidian team)
- Third-party plugins
- Operating system vulnerabilities
