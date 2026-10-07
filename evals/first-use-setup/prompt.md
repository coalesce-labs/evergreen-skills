# First-use setup evaluation

Run `node scripts/discovery-fixture.mjs` and give the returned `task.prompt.txt` to a fresh agent.
It asks to find bookmarks, supplies an existing synthetic checkout and grants no setup permission.
The optional installed catalog is in that prompt; do not name or force a skill.

If the agent asks permission, reply “Not now; don't set anything up.” Verify the decline path first.
Then give a fresh agent the same task. After its setup question, reply “Yes, set up this synthetic
checkout and remember it for both skills, then answer my bookmark question.” Finally ask again
whether the exact guide URL is saved. Use only this fixture, never live bookmarks or accounts.
