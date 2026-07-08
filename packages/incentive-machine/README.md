# @32dashboards/incentive-machine

XState machine replacing legacy `main.js`'s hand-rolled `incentiveState` object
and its scattered `setTimeout`/`setInterval` handles.

## `displayNow` semantics differ from the legacy dashboard on purpose

In the legacy system, the **dashboard itself** called back into the admin API
to clear an incentive's `displayNow` flag once it had been shown, so a second
"Display Now" click could retrigger it. In this system the public display has
no admin credentials at all (that's the point of splitting public/admin
auth), so it structurally cannot make that authenticated call anymore.

Rather than work around that, `displayNow` here means **"pin this incentive
on screen until an admin turns it back off"** -- a level-triggered state, not
a one-shot flash. The admin UI toggles the flag off explicitly when done. This
removes an entire class of bugs (timer leaks, the client mutating server
state) for a small, reasonable UX change.

## Celebration queue

Incentives becoming newly met (`totalRaised >= target`) are queued and
celebrated one at a time (`message` stage, then `detail` stage) regardless of
whether they were on screen when they crossed the threshold. This guarantees
two incentives crossing target in the same update celebrate sequentially, not
simultaneously -- see `machine.test.ts` for the regression test.
