# Inspiration: Why Just Cards Exists

## The Real-World Problem

My family and I like to play card games during downtime when we are out (for example, at breweries or similar places). We regularly play games like:

- Rummy
- Golf
- Cribbage

The friction is predictable:

- Sometimes we forget to bring cards.
- Other times we bring cards but forget a pen and notepad for scoring.

The project exists to remove that friction and make spontaneous card games easy anywhere.

## What We Want the App To Do

## 1) Replace the physical table when cards are missing

The app should feel close to the real card-playing experience:

- Easy room join.
- Clear identity (who you are in the game).
- Clear visibility of other players.
- Visible face-up/public cards for decision-making.
- Private hand/deck view for your own cards.

In short: enough shared table context to make strategy games feel natural.

## 2) Replace pen-and-paper scoring when cards are present

If people already have a physical deck, the app should still add value as a score tool:

- Fast score entry.
- Minimal manual math.
- Rule awareness (example: face cards count as 10).
- Easy undo/redo for mistakes.
- Optional standings at any point.

## The Stretch Goal (Flair)

Long-term, we want game rules to be generated dynamically:

- Point the app at a rules page/site.
- Use an LLM/SLM to interpret the rules.
- Generate machine-readable game/scoring rules.
- Immediately enable play + score flows from those generated rules.

This suggests building reusable game primitives and a schema-driven UI from the start.

## Product Constraints

- Mobile-first and touch-friendly.
- Should feel close to native app behavior.
- Lightweight and simple to operate/deploy.
- Prefer Cloudflare + JavaScript/TypeScript unless clear reasons force migration.

## Decision Lens

Any architecture or feature decision should be evaluated by asking:

1. Does it reduce friction for spontaneous in-person play?
2. Does it preserve social game flow (fast, clear, low setup)?
3. Does it keep rules/scoring extensible to new games?
4. Does it keep operational complexity low for a small project?

