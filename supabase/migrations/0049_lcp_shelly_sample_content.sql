-- 0049_lcp_shelly_sample_content.sql
-- Data seed: inserts one sample devotional (Day 18) into session 7 so Jasmine T. sees it,
-- sets Front Door unit encouragement text (plain text from Shelly's S1 card),
-- and corrects Brittany K.'s session number to 9.
-- No schema changes — safe to run in Supabase SQL editor. Run once.

-- ── Day 18: Mary — "You don't have to understand it. Just say yes." → session 7 ────────────
INSERT INTO lcp_resources
  (session_id, kind, audience, title, content, response_prompt, locked, sort_order, created_by)
SELECT
  (SELECT id FROM lcp_sessions WHERE session_number = 7),
  'devotional',
  'participant',
  'You don''t have to understand it. You just have to say yes.',
  $day18$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stop, Rest &amp; Reset — Basement Day 18</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: 'Jost', Georgia, sans-serif; padding: 32px 16px 64px; color: #1A1A1A; }
  .email-wrap { max-width: 600px; margin: 0 auto; }
  .header { background: #0A2420; padding: 36px 40px 32px; text-align: center; }
  .logo-row { margin-bottom: 24px; }
  .series-name { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.9); }
  .unit-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #5A9878; margin-bottom: 10px; }
  .day-label { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(200,160,32,0.6); margin-bottom: 16px; }
  .header-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; font-weight: 300; line-height: 1.2; color: #FFFFFF; margin-bottom: 8px; }
  .header-title em { font-style: italic; color: #E8C84A; }
  .gold-rule { width: 80px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 20px auto 0; }
  .scripture-banner { background: #1E5045; padding: 24px 36px; border-left: 3px solid #C8A020; }
  .scripture-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FAF7F0; line-height: 1.6; margin-bottom: 8px; }
  .scripture-ref { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #C8A020; text-align: right; }
  .breathe-block { background: #F5F2EA; border-top: 3px solid #2A5C38; padding: 28px 40px 24px; }
  .breathe-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #2A5C38; margin-bottom: 12px; }
  .breathe-invite { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-style: italic; color: #375240; line-height: 1.7; margin-bottom: 20px; }
  .breathe-cue { display: flex; align-items: center; justify-content: center; gap: 20px; }
  .breathe-step { text-align: center; }
  .breathe-count { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; font-weight: 300; color: #2A5C38; line-height: 1; margin-bottom: 4px; }
  .breathe-word { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #6B8A72; }
  .breathe-divider { width: 1px; height: 32px; background: rgba(42,92,56,0.2); margin-bottom: 14px; }
  .body-card { background: #FFFFFF; padding: 40px 40px 36px; }
  .greeting { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: #133028; margin-bottom: 24px; }
  .body-text { font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 20px; }
  .body-text strong { font-weight: 500; color: #133028; }
  .body-text em { font-style: italic; }
  .section-head { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #C8A020; margin: 36px 0 14px; display: flex; align-items: center; gap: 12px; }
  .section-head::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #C8A020, transparent); opacity: 0.3; }
  details.scripture-card { background: #EAF2EC; border-top: 3px solid #2A7A65; margin: 24px 0; }
  details.scripture-card summary { padding: 16px 20px; cursor: pointer; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; list-style: none; -webkit-appearance: none; }
  details.scripture-card summary::-webkit-details-marker { display: none; }
  details.scripture-card summary:hover { background: rgba(42,122,101,0.05); }
  .scripture-header-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; }
  .scripture-icon { width: 30px; height: 30px; background: #2A7A65; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .scripture-icon svg { width: 15px; height: 15px; fill: none; stroke: #EAF2EC; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .scripture-header-text { flex: 1; }
  .scripture-card-ref { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 4px; }
  .scripture-card-quote { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; color: #133028; line-height: 1.5; }
  .scripture-toggle-label { display: inline-flex; align-items: center; gap: 5px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #2A7A65; white-space: nowrap; padding-top: 2px; flex-shrink: 0; }
  .scripture-toggle-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.scripture-card[open] .arrow { transform: rotate(90deg); }
  details.scripture-card[open] .toggle-text-closed { display: none; }
  details.scripture-card:not([open]) .toggle-text-open { display: none; }
  .scripture-body { padding: 0 20px 18px 60px; }
  .scripture-context-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 8px; opacity: 0.7; }
  .scripture-context-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; font-style: italic; color: #133028; line-height: 1.65; }
  details.story-card { background: #F5F0E8; border-top: 3px solid #8A6E08; margin: 28px 0; }
  details.story-card summary { padding: 20px 24px; cursor: pointer; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; list-style: none; -webkit-appearance: none; }
  details.story-card summary::-webkit-details-marker { display: none; }
  details.story-card summary:hover { background: rgba(138,110,8,0.04); }
  .story-header-left { display: flex; align-items: flex-start; gap: 12px; flex: 1; }
  .story-icon { width: 36px; height: 36px; background: #8A6E08; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .story-icon svg { width: 18px; height: 18px; fill: none; stroke: #FBF5D8; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .story-header-text { flex: 1; }
  .story-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 5px; }
  .story-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 600; color: #133028; line-height: 1.2; }
  .story-toggle-label { display: inline-flex; align-items: center; gap: 6px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #8A6E08; white-space: nowrap; padding-top: 4px; flex-shrink: 0; }
  .story-toggle-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.story-card[open] .arrow { transform: rotate(90deg); }
  details.story-card[open] .toggle-text-closed { display: none; }
  details.story-card:not([open]) .toggle-text-open { display: none; }
  .story-body { padding: 0 24px 22px 72px; }
  .story-text { font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 14px; }
  .story-text:last-child { margin-bottom: 0; }
  .story-text em { font-style: italic; }
  .story-text strong { font-weight: 500; color: #133028; }
  .truth-wrap { margin: 28px 0; padding: 28px 24px; text-align: center; }
  .truth-icon-row { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 14px; }
  .truth-rule { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #C8A020); max-width: 80px; }
  .truth-rule.rev { background: linear-gradient(to left, transparent, #C8A020); }
  .truth-icon-circle { width: 32px; height: 32px; border: 1.5px solid #C8A020; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .truth-icon-circle svg { width: 16px; height: 16px; fill: none; stroke: #C8A020; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .truth-eyebrow { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #8A6E08; margin-bottom: 14px; }
  .truth-quote { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 300; font-style: italic; color: #133028; line-height: 1.45; margin: 0 auto; max-width: 460px; }
  .truth-bottom-rule { width: 60px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 18px auto 0; }
  .reflection-card { background: #FBF5D8; border-top: 3px solid #C8A020; padding: 20px 24px; margin: 28px 0; display: flex; align-items: flex-start; gap: 14px; }
  .reflection-icon { width: 32px; height: 32px; border: 1.5px solid #C8A020; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .reflection-icon svg { width: 15px; height: 15px; fill: none; stroke: #8A6E08; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .reflection-content { flex: 1; }
  .reflection-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #8A6E08; margin-bottom: 8px; }
  .reflection-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-style: italic; font-weight: 300; color: #1A1A0A; line-height: 1.65; }
  .prayer-block { background: #0A2420; padding: 32px 40px; }
  .prayer-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #C8A020; margin-bottom: 16px; }
  .prayer-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.8; margin-bottom: 12px; }
  .prayer-close { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 400; color: #C8A020; text-align: right; letter-spacing: 0.08em; }
  .worship-block { background: #1A3830; padding: 24px 40px; text-align: center; border-top: 2px solid rgba(200,160,32,0.3); }
  .worship-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.7); margin-bottom: 12px; }
  .worship-song { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FFFFFF; margin-bottom: 4px; }
  .worship-artist { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); margin-bottom: 16px; letter-spacing: 0.08em; }
  .worship-btn { display: inline-flex; align-items: center; gap: 8px; background: #C8A020; color: #0A2420; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; padding: 10px 22px; text-decoration: none; border-radius: 2px; }
  .worship-btn:hover { background: #E8C84A; }
  .footer { display: none !important; }
  .day-nav { display: none !important; }
</style>
</head>
<body>
<div class="email-wrap">
  <div class="header">
    <div class="logo-row"><span class="series-name">Stop, Rest &amp; Reset</span></div>
    <div class="unit-label">The Basement &nbsp;&middot;&nbsp; Week 4</div>
    <div class="day-label">Day 18 of 20</div>
    <div class="header-title">You don't have to understand it.<br>You just have to say <em>yes.</em></div>
    <div class="gold-rule"></div>
  </div>
  <div class="scripture-banner">
    <div class="scripture-text">"'I am the Lord's servant,' Mary answered. 'May it be to me as you have said.'"</div>
    <div class="scripture-ref">Luke 1:38 &nbsp;&middot;&nbsp; NIV</div>
  </div>
  <div class="breathe-block">
    <div class="breathe-label">Stop &nbsp;&middot;&nbsp; Rest &nbsp;&middot;&nbsp; Reset</div>
    <div class="breathe-invite">Before you read today, think of something God may be asking of you that you don't fully understand yet. You don't have to have an answer right now. Just bring it in here with you. Take one slow breath.</div>
    <div class="breathe-cue">
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">In</div></div>
      <div class="breathe-divider"></div>
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">Hold</div></div>
      <div class="breathe-divider"></div>
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">Out</div></div>
    </div>
  </div>
  <div class="body-card">
    <div class="greeting">Good morning, friend. I'm glad you're here.</div>
    <p class="body-text">Most of us wait until we understand something before we say yes to it.</p>
    <p class="body-text">That is reasonable. That is wisdom, even. You don't sign a lease without reading it. You don't take a job without knowing what it pays. You don't move your family on a feeling. We have learned — often the hard way — that saying yes without information can cost you everything.</p>
    <p class="body-text">And yet. There are moments when God asks something of us that we cannot fully understand in advance. Moments when the only information available is: <em>I am here, and I am asking.</em> And we have to decide what we do with that.</p>
    <div class="section-head">Luke 1</div>
    <details class="scripture-card">
      <summary>
        <div class="scripture-header-left">
          <div class="scripture-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
          <div class="scripture-header-text">
            <div class="scripture-card-ref">Luke 1:26–38</div>
            <div class="scripture-card-quote">"'How will this be,' Mary asked, 'since I am a virgin?'"</div>
          </div>
        </div>
        <span class="scripture-toggle-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">More context</span><span class="toggle-text-open">Close</span></span>
      </summary>
      <div class="scripture-body">
        <div class="scripture-context-label">Luke 1:26–38</div>
        <div class="scripture-context-text">"God sent the angel Gabriel to Nazareth, a town in Galilee, to a virgin pledged to be married to a man named Joseph, a descendant of David. The virgin's name was Mary. The angel went to her and said, 'Greetings, you who are highly favored! The Lord is with you.' Mary was greatly troubled at his words and wondered what kind of greeting this might be. But the angel said to her, 'Do not be afraid, Mary; you have found favor with God. You will conceive and give birth to a son, and you are to call him Jesus...' 'How will this be,' Mary asked the angel, 'since I am a virgin?' The angel answered, 'The Holy Spirit will come on you, and the power of the Most High will overshadow you...' 'I am the Lord's servant,' Mary answered. 'May it be to me as you have said.'"</div>
      </div>
    </details>
    <p class="body-text">Mary was a young woman — probably a teenager — when an angel showed up and told her she was going to carry the Son of God. The angel explained what would happen. What the angel could not explain was <em>how</em> any of it would actually work in her daily life. How she would tell her parents. How she would tell Joseph. What her neighbors would think. Whether anyone would believe her. What it would mean to raise a child who was also God.</p>
    <p class="body-text">None of that was in the announcement. And Mary's response is one of the most extraordinary things anyone has ever said: <em>I am the Lord's servant. May it be to me as you have said.</em></p>
    <p class="body-text">She didn't say yes because she understood. She said yes because she trusted the One who was asking. And then God did what only God can do — He provided what she needed, step by step, as she walked into the thing she had agreed to before she knew how it would unfold.</p>
    <details class="story-card">
      <summary>
        <div class="story-header-left">
          <div class="story-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
          <div class="story-header-text">
            <div class="story-label">A Sparrow LifeChange Program story &nbsp;&middot;&nbsp; Sparrow Organization</div>
            <div class="story-name">Who me?</div>
          </div>
        </div>
        <span class="story-toggle-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read</span><span class="toggle-text-open">Close</span></span>
      </summary>
      <div class="story-body">
        <p class="story-text">When Sparrow applied for the grant to purchase the Twin Oaks Mobile Home Park, the team knew they probably looked ridiculous on paper. Their nonprofit status was brand new. They had a small board and no experience running a manufactured home park. A man familiar with the grant world told Andrew he was crazy to even apply — a grant of over two million dollars would go to organizations with track records, not new ministries with good intentions.</p>
        <p class="story-text">They applied anyway.</p>
        <p class="story-text">And they were awarded the grant. What nobody knew until later was that this particular grant happened to be distributed on a first-come, first-served basis — not by qualifications, but by the order applications arrived. Sparrow's application came in just in time to be the final recipient. The program closed after that. No one else received it.</p>
        <p class="story-text">The team celebrated — and then realized they needed 5,000 just to proceed with the process and actually acquire the grant. Sparrow didn't have 5,000. They sent out an end-of-year letter explaining the need.</p>
        <p class="story-text">One man read it. He had been sitting with the question of where to give at the end of the year when the email arrived in his inbox. He felt moved. Not long after, he was at Andrew and Shelly's house, handing them the check.</p>
        <p class="story-text"><strong>They said yes before they knew how it would work. The provision came after the yes — not before.</strong></p>
        <p class="story-text">That is still how it works. It was true for Mary. It was true for Sparrow. It may be true for you.</p>
      </div>
    </details>
    <p class="body-text">You may be standing at the edge of something that doesn't make sense yet. Something that looks too big, too risky, too much like the kind of thing that happens to other people. God is not asking you to understand it fully. He is asking if you trust Him enough to say yes first and let the provision come after.</p>
    <p class="body-text"><strong>The yes comes before the how. That has always been the way.</strong></p>
    <div class="truth-wrap">
      <div class="truth-icon-row">
        <div class="truth-rule"></div>
        <div class="truth-icon-circle" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg></div>
        <div class="truth-rule rev"></div>
      </div>
      <div class="truth-eyebrow">One truth to carry today</div>
      <div class="truth-quote">God is not asking you to understand before you trust Him. He is asking if you trust Him enough to say yes — and let the how come after.</div>
      <div class="truth-bottom-rule"></div>
    </div>
    <div class="reflection-card">
      <div class="reflection-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.6" fill="#8A6E08"/></svg></div>
      <div class="reflection-content">
        <div class="reflection-label">Sit with this today</div>
        <div class="reflection-text">Is there something you have been waiting to say yes to until you understand more? What would it feel like to say: <em>I am willing</em> — even before the how is clear?</div>
      </div>
    </div>
  </div>
  <div class="prayer-block">
    <div class="prayer-label">A prayer for today</div>
    <div class="prayer-text">Father, I am not always good at yes. I want to understand first. I want a plan. I want to know how it ends before I agree to begin. But Mary didn't know how it would end. She just knew who was asking. Help me learn that kind of trust. I am willing to be willing. That might be as much as I have today — and I'm offering it. May it be to me as You have said.</div>
    <div class="prayer-close">Amen &nbsp;&middot;&nbsp; Day 18 &nbsp;&middot;&nbsp; The Basement</div>
  </div>
  <div class="worship-block">
    <div class="worship-label">Worship &nbsp;&middot;&nbsp; A song to carry this truth</div>
    <div class="worship-song">"Even If"</div>
    <div class="worship-artist">MercyMe</div>
    <a href="https://www.youtube.com/watch?v=B6fA35Ved-Y" target="_blank" rel="noopener noreferrer" class="worship-btn">&#9654; &nbsp; Listen on YouTube</a>
  </div>
</div>
</body>
</html>$day18$,
  'What''s one thing from this devotional you want to carry with you today?',
  false,
  1,
  NULL;


-- ── Front Door unit: encouragement text (from Shelly's Session 1 card) ──────
UPDATE lcp_units
SET encouragement_text =
'You are allowed to have a door.

This week we''re talking about something that might feel a little unfamiliar — the idea that God designed you to have limits. Not walls. Not distance. A door. Something you get to open and close. Something that belongs to you.

You may have spent a long time believing that having limits was selfish. This week we''re going to look at that together.

"Above all else, guard your heart, for everything you do flows from it." — Proverbs 4:23

Come ready to be honest. That is all.'
WHERE name = 'Front Door';


-- ── Brittany K.: correct session from 2 → 9 (she joined Front Door unit) ────
UPDATE families
SET current_session_number = 9
WHERE id = '11111111-1111-1111-1111-111111111103';
