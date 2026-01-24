<goal>
Review implementation for security vulnerabilities and risks. Per **Agentic Validation Tooling**, identify security issues that programmatic validation may have missed.
</goal>

<inputs>
- Alignment doc path
- Prompts folder path
</inputs>

<outputs>
- Security vulnerabilities identified
- Risk assessment and remediation recommendations, ordered by priority
</outputs>

<constraints>
- MUST use git diff to base for implementation review
- MUST check alignment doc for security-specific decisions
- MUST focus on OWASP Top 10 and common vulnerability patterns
</constraints>

## Context Gathering

- Review all implementation changes from base branch
- Read alignment doc for security decisions made during planning
- Identify security-sensitive areas touched

## Vulnerability Categories

| Category | Check For |
|----------|-----------|
| Injection | SQL, command, LDAP, XPath injection |
| Auth | Broken authentication, session management |
| XSS | Cross-site scripting vectors |
| IDOR | Insecure direct object references |
| Misconfig | Security misconfigurations |
| Exposure | Sensitive data exposure |
| Access Control | Broken access control |
| CSRF | Cross-site request forgery |
| Dependencies | Known vulnerable components |
| Logging | Insufficient logging and monitoring |

## Implementation Review

For each changed file:

| File Type | Security Focus |
|-----------|----------------|
| API endpoints | Input validation, auth, authorization |
| Database queries | Parameterization, access control |
| Frontend | XSS prevention, CSRF tokens, secure storage |
| Config files | Secrets exposure, default credentials |
| Auth code | Token handling, session management |

## Risk Assessment

| Severity | Criteria |
|----------|----------|
| Critical | Remotely exploitable, data breach risk |
| High | Significant vulnerability, requires attention |
| Medium | Security weakness, should be addressed |
| Low | Minor issue, improve when convenient |

## Output Format

Return findings ordered by priority:

```
## Security Review

### Critical
- [File:line]: [Vulnerability] -> [Risk] -> [Remediation]

### High
- [File:line]: [Vulnerability] -> [Risk] -> [Remediation]

### Medium
- [File:line]: [Vulnerability] -> [Risk] -> [Remediation]

### Low
- [File:line]: [Issue] -> [Recommendation]

## Summary
- [Total vulnerabilities found]
- [Risk score]
- [Immediate actions required]
```