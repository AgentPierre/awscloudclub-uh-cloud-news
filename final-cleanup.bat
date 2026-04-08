@echo off
REM Final Repository Cleanup
REM Removes scripts and consolidates branches

echo ============================================
echo Final Repository Cleanup
echo ============================================
echo.

echo Step 1: Removing cleanup scripts...
del rewrite-history.bat 2>nul
del force-push.bat 2>nul
del cleanup-after-rewrite.bat 2>nul

echo.
echo Step 2: Committing removal...
git add -A
git commit -m "chore: remove history rewrite scripts" -m "Scripts completed their purpose - no longer needed." -m "" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

echo.
echo Step 3: Deleting merged local branches...
git branch -d copilot/add-security-md-to-public 2>nul
git branch -d copilot/review-and-consolidate-branches 2>nul
git branch -d copilot/security-audit-code-base 2>nul
git branch -d copilot/vscode-mnplltro-q4mw 2>nul
git branch -d pr/copilot-swe-agent/1 2>nul

echo.
echo Step 4: Deleting merged remote branches...
echo (Errors are OK if branches don't exist on remote)
git push origin --delete copilot/add-security-md-to-public 2>nul
git push origin --delete copilot/review-and-consolidate-branches 2>nul
git push origin --delete copilot/security-audit-code-base 2>nul
git push origin --delete copilot/vscode-mnplltro-q4mw 2>nul
git push origin --delete pr/copilot-swe-agent/1 2>nul

echo.
echo Step 5: Pushing to main...
git push origin HEAD:main

echo.
echo ============================================
echo Cleanup Complete!
echo ============================================
echo.
echo Remaining tasks:
echo 1. Enable GitHub Secret Scanning at:
echo    https://github.com/[org]/awscloudclub-uh-cloud-news/settings/security_analysis
echo 2. Enable Push Protection for secrets
echo.

pause
