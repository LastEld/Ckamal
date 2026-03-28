# Pull Request

## 📋 Description

<!-- Briefly describe the changes in this PR -->

Fixes # (issue number)

## 🔄 Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🔧 Refactoring (code changes that neither fix a bug nor add a feature)
- [ ] ⚡ Performance improvement
- [ ] 🔒 Security fix

## 🧪 Testing

- [ ] I have added tests for new functionality
- [ ] I have updated existing tests
- [ ] All tests pass locally (`npm test`)
- [ ] I have tested edge cases

### Test Commands Run

```bash
# List the test commands you ran
npm run verify:release
```

## 📊 Code Quality

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have removed any `console.log` statements (except for debugging)

## 🔗 Related Issues

<!-- List any related issues or PRs -->
- Closes #
- Related to #

## 📸 Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## 📝 Additional Notes

<!-- Any additional information for reviewers -->

## ✅ Pre-Submission Checklist

### General
- [ ] PR title follows convention: `[type]: Brief description`
- [ ] Branch is up to date with `main`/`develop`
- [ ] Commits are squashed (if required by project guidelines)

### BIOS Integration (if applicable)
- [ ] Changes don't break `github-client.js`
- [ ] Changes don't break `update-manager.js`
- [ ] Changes don't break `patch-verifier.js`
- [ ] Compatibility verified with existing workflows

### Security
- [ ] No hardcoded secrets or credentials
- [ ] Input validation implemented where needed
- [ ] No `eval()` or `new Function()` usage
- [ ] Security implications considered

---

**By submitting this PR, I confirm that:**
- [ ] I have read and followed the [CONTRIBUTING.md](../CONTRIBUTING.md) guidelines
- [ ] My code is my own original work, or I have permission to use it
- [ ] I license this contribution under the project's MIT license
