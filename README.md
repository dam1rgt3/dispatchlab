# DispatchLab

An interactive field service dispatch simulator. Open the demo, take a technician off shift, and work out who can still reach each customer on time.

**[Open the dispatch board](https://dam1rgt3.github.io/dispatchlab/)** · [Verification runs](https://github.com/dam1rgt3/dispatchlab/actions/workflows/test.yml)

## Try a day on the desk

The board opens at **10:10** with three technicians and seven assigned visits. All customer windows refer to **arrival**. A visit may finish after its arrival window, provided the technician can still reach the next booking and finish the shift by 17:00.

| Disruption | Decision to try |
| --- | --- |
| Technician out | Michael calls in sick. Assign Anna to Oak Street at 11:15. At Cedar Park, Alex can arrive at 13:40 after a 45-minute drive. Anna is only 10 minutes away after Elm House, but her 14:30 arrival needs customer approval. |
| Job running late | Anna needs 100 more minutes at Harbor Clinic. Compare keeping her on Elm House at 13:05 with sending Alex at 13:13. Work already underway stays with its technician. |
| Urgent request | Library Annex needs a 30-minute controls check with arrival by 11:00. Compare Michael's earlier arrival with Alex's shorter drive. Existing visits stay booked. |

Select a preset or write a short English dispatch note. For example, try **“Anna is running 45 minutes late.”** Preview the interpretation before using it. Select a ticket to compare options and see the travel calculation. Switch between **Original** and **Current**, inspect a timeline block, or undo the last decision.

For an arrival outside the promised window, hold the option and record the simulated customer's answer. A hold does not reserve the technician or count as an assignment. The board recalculates options after each assignment and discards holds that no longer fit. Resetting restores the sample shift. Refreshing starts a new session.

## How it works

- **Language intake** uses a compact multinomial Naive Bayes classifier trained in the browser on labeled example phrases. The model recognizes three incident families. Deterministic checks extract a technician and an overrun duration. Ambiguous input prompts clarification. The urgent visit uses the Library Annex sample ticket. No hosted model, external service or API key is required.
- **Scheduling** enumerates gaps in qualified technicians' routes. It checks the drive into the visit, service duration, the drive to the next booking, absence, and shift end. It shows the earliest feasible arrival in each gap and compares arrival time and approach travel time. Booked visits outside the incident are fixed. Decisions apply one visit at a time.
- **Customer approval** is tied to a specific ticket, technician and arrival. An approved late visit keeps its original window visible. Everything runs in the browser against fictional jobs and fixed travel estimates. Customer contact and live traffic are outside this demo.

## Run and verify

Serve the repository root with any static HTTP server. For example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. To run the planner and language-intake suite with Node.js 22:

```sh
node --test tests/planner.test.mjs
```

GitHub Actions also opens Chromium and drives all three scenarios, including late-arrival approval, declined suggestions, undo, natural-language preview and a mobile viewport. The main-branch check repeats the browser flow against GitHub Pages.

## Source

| File | Responsibility |
| --- | --- |
| [planner.mjs](src/planner.mjs) | Sample day, travel times, route feasibility and dispatch decisions |
| [intake.mjs](src/intake.mjs) | English intent classification and validation |
| [app.mjs](src/app.mjs) | Interactive timeline, decision desk, approval and undo |
| [Planner tests](tests/planner.test.mjs) · [Browser tests](tests/browser.mjs) | Dispatch invariants and end-to-end verification |
