-- Basement Session 1 content: merged Teacher Guide (15-min Story Edition
-- devotional folded in first, per the 2026-07-31 devo+guide merge convention)
-- and all 5 STOP/REST/RESET readings, verbatim from Shelly's source files.
--
-- Teacher Guide content converted from her actual .docx via mammoth (preserves
-- her real bold/italic/table structure mechanically, not retyped), then run
-- through the app's own sanitizeRichText() so what lands here matches exactly
-- what will be stored when pasted through the UI. Devotionals are raw HTML,
-- completely unmodified per the "leave her material exactly as she made it"
-- rule (see migration 0117 and lcp-curriculum-admin memory).
--
-- Guarded to no-op until migration 0086 has actually created the Basement
-- session rows (Basement is session_number 5 in the program's 1-48 numbering)
-- -- and idempotent against re-runs, so this is safe to ship to Byron now and
-- run any time after 0086 lands, in either order relative to other work.

insert into lcp_resources (session_id, kind, audience, title, content, sort_order)
select (select id from lcp_sessions where session_number = 5), 'teacher_guide', 'staff', 'Session 5 (Basement 1): What’s in the Basement? — Teacher Guide', $tg$<table><tbody><tr><td><p>Becoming Home  ·  Sparrow LifeChange Program</p><p><strong>The Basement  ·  Session 1</strong></p><p>What’s in the Basement?</p><p>Teacher Guide  ·  2-Hour Version  ·  Complete Script</p></td></tr></tbody></table><p><strong>Session at a Glance</strong></p><table><thead><tr><th><p><strong>TIME</strong></p></th><th><p><strong>ELEMENT</strong></p></th><th><p><strong>MIN</strong></p></th><th><p><strong>NOTES</strong></p></th></tr></thead><tbody><tr><td><p>0:00</p></td><td><p>Opening check-in — emotion + new or good thing</p></td><td><p>10</p></td><td><p>Circle goes around</p></td></tr><tr><td><p>0:10</p></td><td><p>Announcements</p></td><td><p>3</p></td><td><p>Update slide 3 each week</p></td></tr><tr><td><p>0:13</p></td><td><p>Opening Devotional — Story Edition</p></td><td><p>15</p></td><td><p>God is already down there</p></td></tr><tr><td><p>0:28</p></td><td><p>Session intro + Scripture</p></td><td><p>5</p></td><td><p>Slides 1 &amp; 6 · Deut 30:19</p></td></tr><tr><td><p>0:33</p></td><td><p>Teaching — Basement concept + 3 things stored</p></td><td><p>15</p></td><td><p>Slides 7–9 · box illustration</p></td></tr><tr><td><p>0:48</p></td><td><p>Teaching — Five ways patterns get passed down</p></td><td><p>12</p></td><td><p>Slide 12</p></td></tr><tr><td><p>1:00</p></td><td><p>Private reflection — which pathway is most prominent?</p></td><td><p>8</p></td><td><p>Written then shared around circle</p></td></tr><tr><td><p>1:08</p></td><td><p>Memory walk — The house you grew up in</p></td><td><p>15</p></td><td><p>Slides 14–18 · music on</p></td></tr><tr><td><p>1:23</p></td><td><p>Private reflection — memory walk notes</p></td><td><p>5</p></td><td><p>Write what surfaced</p></td></tr><tr><td><p>1:28</p></td><td><p>Teaching — Gifts passed down through hard things</p></td><td><p>8</p></td><td><p>Slide 10</p></td></tr><tr><td><p>1:36</p></td><td><p>Circle sharing — a gift received through difficulty</p></td><td><p>10</p></td><td><p>Slide 11 · every voice</p></td></tr><tr><td><p>1:46</p></td><td><p>Introduce genogram — send home</p></td><td><p>10</p></td><td><p>Slide 20 · symbol key</p></td></tr><tr><td><p>1:56</p></td><td><p>Closing prayer</p></td><td><p>5</p></td><td><p>Slide 21 · choose life</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Materials Needed</strong></p><ul><li>Pens or pencils</li><li>Soft instrumental music (playing before anyone arrives)</li><li>Genogram handout with symbol key — one per participant</li><li>Student handouts — one per participant</li><li>Referral resource cards — available but not displayed</li><li>Three physical boxes with items (see box illustration notes)</li><li>Announcements updated on slide 3 before each session</li></ul></td></tr></tbody></table><table><tbody><tr><td><p><strong>⚠  SENSITIVE:  </strong><em>The memory walk may surface significant pain. Hold the space — do not probe or process in the group. Check in privately with anyone who seems significantly distressed after the session.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PRE-SESSION  ·  Opening Sequence</strong></p><p>25 minutes  ·  Before basement content begins</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>10 min</strong></p></td><td><p><strong>OPENING CHECK-IN — Emotion + new or good thing  —  Slide 2</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>Welcome. Before we do anything else, let’s check in. Two things from each person — and then we’ll move on.</p><p><strong>Leader:  </strong>First — what emotion did you carry in the door today? You don’t have to explain it or justify it. Just name it. Anxious, tired, hopeful, numb, grateful, heavy — whatever it is, it’s welcome here.</p><p><strong>Leader:  </strong>Second — share one new or good thing from your week. It can be small. A cup of coffee that was exactly right. Your kid said something that made you laugh. One moment that was good. We’ll go around the circle — everyone gets a turn.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Go around the full circle for both prompts. Keep it moving warmly — this is not a processing time, just a checking-in time. If someone shares something heavy as their emotion, receive it briefly and move on: ‘Thank you for naming that. We’ll hold that as we go.’ The new or good thing prompt always follows and shifts the atmosphere toward warmth before the teaching begins.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>3 min</strong></p></td><td><p><strong>ANNOUNCEMENTS — Slide 3</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>A few quick things before we dive in.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Update slide 3 before each session. The slide has three columns: Program Update, Upcoming Date, and Reminder. Read from the slide — don’t ad-lib announcements, which tends to run long. Keep this to three minutes maximum.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>15 min</strong></p></td><td><p><strong>OPENING DEVOTIONAL — STORY EDITION — Slide 4  ·  God is already down there</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Devotional for Session 1: God is already down there (15-Minute Devotional · Story Edition)</strong></p><p>Every session begins with a devotional that connects to the session’s theme before teaching begins. For Session 1, the devotional anchors the basement metaphor spiritually: God is not surprised by what’s in the basement. He has already been there. This reframes going in as joining God rather than venturing alone.</p></td></tr></tbody></table><blockquote><p>“Where can I go from your Spirit? Where can I flee from your presence? If I go up to the heavens, you are there; if I make my bed in the depths, you are there.”</p><p><strong>— Psalm 139:7–8</strong></p></blockquote><p><strong>Fictional vignette · The box that moved three times</strong></p><p>It had moved with her from the apartment in Tacoma to the house in Portland to the room she was renting now. Same brown tape, still unbroken. Same handwriting on the side in black marker: MOM’S THINGS.</p><p>Cassie didn’t know exactly what was in it. She had a general sense — photographs, maybe. Some papers. Things she’d grabbed from her mother’s apartment two days after the funeral because the landlord needed the unit cleared. She hadn’t been ready to open it then. That was six years ago.</p><p>She put it in the back of every closet she ever had. She moved it carefully, treating it like something fragile. She never opened it.</p><p>One night she found herself sitting in front of the closet at two in the morning, just staring at the door. She didn’t know what she was afraid of exactly. That what was inside would be painful? That it wouldn’t be? That she’d open it and finally have to feel something she’d been carrying without looking at for six years?</p><p>She didn’t open it that night. But she stayed there a long time. Something had shifted. The box was still closed — but she had at least stopped pretending it wasn’t there.</p><p>Most of us have something in the back of a closet. Not always a literal box — though sometimes that too. A closed door. A chapter of the story we don’t go back to. A season or a wound or a pattern we have carefully moved from place to place without opening.</p><p>We act, sometimes, as though the basement of our lives is hidden from God. As though if we keep the door shut tightly enough, He won’t see what is in there. But Psalm 139 dismantles that idea completely. The psalmist searches every direction for somewhere God is not. He cannot find it. The heights. The depths. The far side of the sea. The darkness.</p><p><strong>“Even there your hand will guide me,” he writes (v.10). Even there.</strong></p><p><strong>Biblical story · Psalm 139 &amp; 1 Samuel 24 · David in the cave</strong></p><p>Scholars believe Psalm 139 may have been written during one of the darkest seasons of David’s life — perhaps while he was hiding in the caves of En Gedi, fleeing from King Saul who wanted him dead. He was literally in the depths, in the dark, surrounded by rock walls and the sound of dripping water.</p><p>And from that cave — from the most hidden, frightening place of his life — he writes: “You have searched me, Lord, and you know me” (v.1). Not: You have abandoned me in this cave. Not: I am alone in the dark. You are here. You know me.</p><p>God did not wait for David to come out of the cave to show up. He was already in the cave. He had been there the whole time.</p><p>Going into the basement this month is not an act of bracing yourself to face what God cannot see. It is an act of joining Him where He already is. He has been in the hard places of your history — in the boxes you have never opened, in the rooms with the door shut — waiting for you to come and look with Him.</p><p><strong>You are not going down alone. You have never been alone down there.</strong></p><table><tbody><tr><td><p><strong>What God is building</strong></p><p>Before any structural repair can happen in the basement of a house, you have to get down there with a light. God is the light. He is already illuminating what needs to be seen — not to condemn, but to restore.</p></td></tr></tbody></table><p><strong>Open with this question:</strong> Is there something you have been carefully not looking at — a closed box, a shut door in your story? What would it mean to finally open it with God holding the light?</p><p><strong>Opening prayer — spoken together:</strong> Lord, You are already in our basements. You have been there the whole time. Today we open the door and come down to where You are. We ask You to be the light. Show us what we need to see — not to be crushed by it, but to finally understand it. You are God in the depths. We are not alone down here. Amen.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Read the story and reflection aloud, then pause for quiet before the closing prayer. This is the emotional bridge between checking-in and the session content. Slide 4 stays on screen while you speak. Do not rush it.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 1  ·  Session Intro + Scripture</strong></p><p>5 minutes  ·  Slides 1 &amp; 6</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>5 min</strong></p></td><td><p><strong>SESSION INTRO + SCRIPTURE — Slides 1 &amp; 6</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>This month we are going into the basement.</p><table><tbody><tr><td><p><em>“I have set before you life and death, blessings and curses. Now choose life, so that you and your children may live.”</em></p><p><strong>— Deuteronomy 30:19</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>Choose life. That phrase is going to follow us all month. Going into the basement is not about getting stuck in the past — it’s about seeing it clearly enough to choose a different path. For yourself, and for the children watching you.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Keep this brief and intentional. The scripture is the anchor for the whole unit — let it land before moving into teaching. Pause after reading it.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 2  ·  Teaching — The Basement Concept</strong></p><p>15 minutes  ·  Slides 7–9</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>15 min</strong></p></td><td><p><strong>TEACHING — Basement concept + three things stored  —  Slides 7–9</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Why this teaching before the pathways?</strong></p><p>Many women have been told their whole lives that their pain is their fault, that they’re broken, or that their family’s patterns are just ‘how things are.’ The basement metaphor reframes all of that: this is not about damage, it is about what gets stored. This teaching creates the emotional container that makes the five-pathway teaching land as revelation rather than condemnation.</p></td></tr></tbody></table><p><strong>Leader:  </strong>Here’s what actually ends up in a basement. Three things.</p><p><strong>Leader:  </strong>The first is things we inherited. Patterns and ways of being that were handed to us before we were old enough to refuse them. Nobody asked whether we wanted the template. We just got it — and we’ve been living by it, often without knowing it came from somewhere.</p><p><strong>Leader:  </strong>The second is things we stored. Our own pain. Experiences we didn’t have time to process. Grief we never had space to grieve. Life kept moving, and the hard things went into the basement because there was nowhere else to put them.</p><p><strong>Leader:  </strong>The third is things we buried. Shame. Secrets. The things we decided were too dangerous to look at directly. Here’s what’s true about buried things: they don’t decompose. They sit down there, quietly shaping everything in the house above. A water leak in the basement damages the foundation. Mold affects the air in every room. What’s stored underground affects everything above ground — even if no one ever goes down there.</p><p><strong>Leader:  </strong>This is what the things in your basement do. They don’t stay in the basement. They rise. They show up in your relationships, your responses, the things you reach for when life gets hard. They show up in your children.</p><p><strong>Leader:  </strong>God is not afraid of the basement. He already knows what’s in it. This month is an invitation to see what He has already seen — not with shame, but with His eyes.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Pause after ‘they rise.’ Let that sit for a full beat. The phrase ‘they show up in your children’ will often land visibly — many women are in this room partly because of what they have watched in their own children. Honor that without naming it.</em></p></td></tr></tbody></table><p><strong>Visual Reference — The Three Types of Things in Every Basement</strong></p><p>Display this illustration while teaching. Point to each box as you describe it.</p><table><thead><tr><th><p><strong>📦  Box 1<br>Things We Inherited<br>Passed down before we could choose</strong></p></th><th><p><strong>📦  Box 2<br>Things We Stored<br>Our own pain with nowhere to go</strong></p></th><th><p><strong>📦  Box 3<br>Things We Buried<br>Shame and secrets kept in the dark</strong></p></th></tr></thead><tbody><tr><td><p>Ways conflict was handled at home<br>What you learned about whether it’s safe to need people<br>Family rules no one spoke aloud but everyone knew</p></td><td><p>Grief that never had space to be grieved<br>Anger that had nowhere safe to go<br>Times you needed someone and no one came</p></td><td><p>Shame about past choices or things done to you<br>Secrets you’ve been keeping for years<br>Beliefs about yourself you’ve never said out loud</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Display this illustration on screen or as a printed reference throughout the teaching. Women can point to a box rather than name something directly — ‘that one’ is a completely valid answer. Receive it as such.</em></p></td></tr></tbody></table><p><strong>Practical Illustration — The Leader Opens Three Boxes</strong></p><p>After describing each of the three categories, bring the teaching to life by opening a physical box with items inside. Each item is held up, named, and set on the table. The boxes remain open for the rest of the session.</p><table><tbody><tr><td><p><strong>Why physical items work</strong></p><p>When a woman watches you lift a padlock out of a box and hold it in silence, something in her body recognizes what words alone cannot reach. The items do not explain the content — they evoke it. They also give women something concrete to point to during discussion rather than having to name things directly. ‘That one,’ pointing to the stone or the unsent envelope, is a courageous act. Receive it as such.</p></td></tr></tbody></table><p><strong>📦  Box 1  ·  Things We Inherited  —  Passed down before we could choose</strong></p><table><thead><tr><th><p><strong>ITEM</strong></p></th><th><p><strong>WHAT TO SAY WHEN YOU HOLD IT UP</strong></p></th></tr></thead><tbody><tr><td><p><strong>Spool of thread — two colors tangled</strong></p></td><td><p>Two generations, wound together before you had any say. ‘You didn’t choose the thread you were handed. But you’ve been weaving with it your whole life.’</p></td></tr><tr><td><p><strong>Old skeleton key with no visible lock</strong></p></td><td><p>A key to a door you never chose. ‘Someone handed you this key. You may not even know what door it opens.’</p></td></tr><tr><td><p><strong>Small hand mirror, placed face-down</strong></p></td><td><p>How you see yourself was shaped before you knew you were looking. ‘This mirror is face-down. This month we are going to turn it over — gently, together.’</p></td></tr><tr><td><p><strong>Dried flower or pressed seed</strong></p></td><td><p>Not everything inherited was damage. Some of it was beauty, faith, survival. ‘This was also in the box. It matters too.’</p></td></tr></tbody></table><p><strong>📦  Box 2  ·  Things We Stored  —  Our own pain with nowhere to go</strong></p><table><thead><tr><th><p><strong>ITEM</strong></p></th><th><p><strong>WHAT TO SAY WHEN YOU HOLD IT UP</strong></p></th></tr></thead><tbody><tr><td><p><strong>Heavy stone</strong></p></td><td><p>Hold it visibly — let the room see the weight. ‘This is what grief feels like when it has nowhere to go. It doesn’t get lighter by pretending it isn’t there.’</p></td></tr><tr><td><p><strong>Sealed envelope marked ‘Unsent’</strong></p></td><td><p>Things said in our hearts that were never spoken. ‘This letter was never sent. It didn’t disappear — it went into the basement.’</p></td></tr><tr><td><p><strong>Single worn glove, no partner</strong></p></td><td><p>Loneliness. Something meant to come in a pair — love, belonging, safety — that arrived alone or not at all. ‘This glove is still looking for its match.’</p></td></tr><tr><td><p><strong>Stopped clock or old watch</strong></p></td><td><p>Grief stops time. ‘Something was frozen in this box — a moment when loss happened and part of us never moved on.’</p></td></tr></tbody></table><p><strong>📦  Box 3  ·  Things We Buried  —  Shame and secrets kept in the dark</strong></p><table><thead><tr><th><p><strong>ITEM</strong></p></th><th><p><strong>WHAT TO SAY WHEN YOU HOLD IT UP</strong></p></th></tr></thead><tbody><tr><td><p><strong>Unlit candle</strong></p></td><td><p>Hold it up unlit. ‘Shame keeps the match away. But the candle isn’t broken — it just hasn’t been lit yet.’ This foreshadows Session 3.</p></td></tr><tr><td><p><strong>Padlock — locked, no key present</strong></p></td><td><p>Set it down with deliberate weight and silence. ‘There is no key in this box. Shame keeps things locked by convincing us there is no key. But there is. It’s not found by hiding.’</p></td></tr><tr><td><p><strong>Folded bandage, unused</strong></p></td><td><p>A wound that was never tended. ‘This bandage is still folded. Nobody ever got to use it. That happens when shame convinces you the wound is your fault.’</p></td></tr><tr><td><p><strong>Small green shoot — something alive</strong></p></td><td><p>End with this one. Hold it gently. ‘Buried is not dead. It means hidden. And hidden things can come into the light.’ Set it down last, most visible.</p></td></tr></tbody></table><p><strong>Opening the Boxes — How to Run It</strong></p><table><tbody><tr><td><p><strong>SETUP<br>Before session</strong></p></td><td><p>Place three closed boxes at the front before anyone arrives. Wrap each item inside in tissue paper — the unwrapping slows you down and gives each reveal ceremony. Do not explain the boxes when people sit down. When asked, say: ‘We’ll get there.’</p></td></tr><tr><td><p><strong>OPEN<br>Box 1</strong></p></td><td><p>“Every one of us came into the world already carrying something. Before we made a single choice, a box was being packed for us. Let me show you what I mean.” Lift the lid. Unwrap each item, hold it up, say its line, and set it on the table. Take your time.</p></td></tr><tr><td><p><strong>OPEN<br>Box 2</strong></p></td><td><p>“This box is different. These things didn’t come from our families. They came from our own lives. Our own losses.” When you reach the stone — hold it visibly, feel the weight, let the room see you hold it. Then say: ‘This is what grief feels like when it has nowhere to go.’</p></td></tr><tr><td><p><strong>OPEN<br>Box 3</strong></p></td><td><p>“This last box is the hardest. These are the things that didn’t just end up here by accident.” Go slower here. Padlock — hold it, set it down with weight and silence. End with the green shoot: ‘Buried is not dead. Hidden things can come into the light.’ Set it down last, most visible.</p></td></tr><tr><td><p><strong>LEAVE<br>All open</strong></p></td><td><p>“These boxes stay open on the table for the rest of tonight. We’re not putting the lids back on. We opened them. That’s what this month is about.” Leave all three boxes open with items displayed for the remainder of the session.</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Sourcing — Allow one week to gather everything</strong></p><p>Antique shops &amp; thrift stores: skeleton key, stopped clock or watch, worn glove. Craft stores: spool of thread (wind two colors together), tissue paper, boxes (wooden keepsake boxes give a lasting feel). Online: padlock-and-key set — search ‘vintage skeleton key set’; small hand mirror. Garden center: small succulent or green shoot in a tiny pot. Write ‘Unsent’ on the envelope in your own handwriting — it makes it feel personal and real.</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 3  ·  Teaching — Five Ways Patterns Get Passed Down</strong></p><p>12 minutes  ·  Slide 12</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>12 min</strong></p></td><td><p><strong>TEACHING — Five ways patterns get passed down  —  Slide 12</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>How to teach this section well</strong></p><p>The five pathways are the conceptual backbone of the Basement unit. Women who understand them come to the memory walk with sharper eyes — they know what to look for. Teach each pathway slowly, with a pause between each one. You are not reading from a list; you are naming something each woman has been living inside without language for it. Watch for quiet laughs, still faces, eyes that drop. Those are the sounds of recognition.</p></td></tr></tbody></table><p><strong>Leader:  </strong>Now I want to go deeper on how patterns travel from one generation to the next. It doesn’t just happen by accident. There are specific pathways. And once you can see the pathway, you can begin to close it.</p><table><tbody><tr><td><p><strong>1</strong></p></td><td><p><strong>What We Witnessed</strong></p><p><em>Learned from watching the adults around us</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>WHAT TO SAY<br></strong>Children absorb what they see. If you watched an adult handle conflict by screaming, or by going silent, or by leaving — your nervous system filed that away as the template. You didn’t choose it. You watched it enough times that it became your default.</p></td><td><p><strong>TEACHING NOTE<br></strong><em>The most accessible pathway — nearly every woman recognizes it immediately. Watch for: quiet laughs and nodding, women who say ‘I swore I’d never do that.’</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>2</strong></p></td><td><p><strong>What Was Done to Us</strong></p><p><em>Absorbed through direct experience of harm or neglect</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>WHAT TO SAY<br></strong>Abuse, neglect, and abandonment don’t just cause pain — they teach a child something about who she is. About what she deserves. About whether she is safe. Those lessons travel forward.</p></td><td><p><strong>TEACHING NOTE<br></strong><em>This pathway carries the most weight for many women in transitional housing. The harm was not just an event — it was a teacher. Watch for: women who go very still, women who minimize (‘it wasn’t that bad’), tears that come from nowhere.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>3</strong></p></td><td><p><strong>What Was Never Spoken</strong></p><p><em>The power of silence and family secrets</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>WHAT TO SAY<br></strong>Silence is its own teacher. A family that never talked about a particular loss, trauma, or shame taught everyone in it that this thing is unspeakable. And unspeakable things don’t disappear — they become the pressure in the room that no one names.</p></td><td><p><strong>TEACHING NOTE<br></strong><em>Common silences in this program: the father who left and was never spoken of again; the addiction everyone worked around but no one named; abuse witnessed by everyone and acknowledged by no one.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>4</strong></p></td><td><p><strong>What Was Spoken Over Us</strong></p><p><em>Labels that arrived as identity, not just description</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>WHAT TO SAY<br></strong>The labels people gave us. ‘You’re just like your father.’ ‘You’ll never amount to anything.’ ‘You’re the difficult one.’ Words spoken by authority figures in early childhood arrive as identity — not just description.</p></td><td><p><strong>TEACHING NOTE<br></strong><em>Young children cannot filter adult words the way adults can. A repeated label enters the child not as one person’s opinion but as fact. Note: positive labels also bind — ‘you’re so pretty’ taught her appearance was her primary value.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>5</strong></p></td><td><p><strong>What Systems Taught Us</strong></p><p><em>Institutional shaping of worth, options, and future</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>WHAT TO SAY<br></strong>Foster care. Poverty. Incarceration. Housing instability. These systems shape how a person understands her own worth and what her future is allowed to be. They are not personal — but they become deeply personal.</p></td><td><p><strong>TEACHING NOTE<br></strong><em>This pathway is unique in being systemic rather than interpersonal. Each system sends an unspoken message: foster care = you are temporary; poverty = there is never enough; housing instability = safety is not for people like you. Name this pathway with deep respect and without shame.</em></p></td></tr></tbody></table><p><strong>Leader:  </strong>Every woman in this room has been shaped by some combination of these. That is not weakness. That is what it means to have grown up in a human family in a broken world. The question is not whether these things shaped you — they did. The question is: what do you want to do with that now?</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Name each pathway slowly with a pause between each one. You will see recognition land differently across the five. After the closing line, pause a full five seconds before moving into the private reflection.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 4  ·  Private Reflection + Sharing — The Pathways</strong></p><p>8 minutes</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>8 min</strong></p></td><td><p><strong>PRIVATE REFLECTION + CIRCLE SHARE — Which pathway is most prominent?</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Why reflect immediately after the teaching?</strong></p><p>Moving from the pathway teaching directly into private reflection anchors the concepts in each woman’s own story before the memory walk. Writing it first gives every woman a voice, including those who rarely speak in group. The circle share that follows means every person is heard — briefly, without pressure to explain.</p></td></tr></tbody></table><p><strong>Leader:  </strong>I want to give you a few minutes to write something privately. On your handout, look at the five pathways. Which one do you recognize most in your own story? Which one is most active — most present — as a problem area in your life right now?</p><p><strong>Leader:  </strong>You can circle it. You can write a sentence. You can just sit with it. Take three or four minutes.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Allow 3–4 minutes of quiet writing with soft music. Then continue:</em></p></td></tr></tbody></table><p><strong>Leader:  </strong>Let’s go around the circle. When it’s your turn, just name the number or the pathway — whichever one feels most true for you right now. You don’t have to explain it. Just name it.</p><p><strong>Leader:  </strong>I’ll start.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Go around the full circle. After each woman names her pathway, respond simply: ‘Thank you for sharing that.’ Do not ask follow-up questions or invite elaboration. This is a naming circle, not a processing circle. The goal is that every voice is in the room before you move to the memory walk. After the circle: ‘Thank you. Now I want to take you somewhere. Back to the house you grew up in.’</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 5  ·  Memory Walk — The House You Grew Up In</strong></p><p>20 minutes  ·  Slides 14–18</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>15 min</strong></p></td><td><p><strong>MEMORY WALK — Room by room  —  Slides 14–18  ·  music on</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Why the memory walk belongs here — after the pathways</strong></p><p>The memory walk goes somewhere older and more sensory than the pathway teaching. After naming which pathway is most active in her story, a woman is now primed to see it operating in specific rooms, specific moments, specific people. The two sections amplify each other.</p></td></tr></tbody></table><p><strong>Leader:  </strong>I want to take you somewhere. Not forward — back. Back to the house you grew up in. Or the apartment, or wherever home was. And I want us to walk through it together, room by room. Not to analyze it. Just to remember what it was like to be there. Some of what comes up might be warm. Some might be hard. All of it belongs.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Start soft background music now. Move through 3–4 rooms — always include the kitchen and bedroom. For each room: read the leader script slowly, ask the prompts, allow 1–2 minutes of quiet writing on handouts, then brief sharing before moving to the next room.</em></p></td></tr></tbody></table><p><strong>The Kitchen</strong></p><p><strong>Leader:  </strong>Let’s start in the kitchen. Close your eyes if you’re comfortable. Picture the kitchen you grew up in. What does it smell like?</p><ul><li>What was eating as a family like? Did you sit down together?</li><li>Who cooked? Is there a meal or a smell you still remember?</li><li>Did grandparents, aunts, uncles come over? What were those gatherings like?</li><li>Was there enough food? Was the table warm — or tense?</li></ul><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Food and meals carry enormous emotional weight — belonging, scarcity, warmth, tension. Receive whatever comes. Some women will light up; others will go quiet. Both are telling you something.</em></p></td></tr></tbody></table><p><strong>The Living Room</strong></p><p><strong>Leader:  </strong>Now move to the living room — or wherever the family gathered in the evenings.</p><ul><li>What were evenings like at home? What happened after dinner?</li><li>Was the TV always on? Did everyone watch together or go separate ways?</li><li>Who was usually there? Who was absent?</li><li>Was it a place that felt relaxed — or tense — or unpredictable?</li></ul><p><strong>Your Bedroom</strong></p><p><strong>Leader:  </strong>Let’s go to your bedroom — or the space where you slept as a child.</p><ul><li>What was your bedroom like? Did you share it — with whom, and how many?</li><li>Did it feel like your own space, or just a place to sleep?</li><li>Did you feel safe there at night?</li><li>Was there any privacy? Could you close a door and be left alone?</li></ul><table><tbody><tr><td><p><strong>⚠  SENSITIVE:  </strong><em>The bedroom safety question may surface disclosures about childhood abuse. Receive it warmly and briefly — ‘thank you for being willing to say that’ — then continue. Check in privately after the session.</em></p></td></tr></tbody></table><p><strong>Holidays &amp; Vacations</strong></p><p><strong>Leader:  </strong>Last one — let’s step outside the house and think about holidays and vacations.</p><ul><li>What were holidays like — Christmas, birthdays, Thanksgiving?</li><li>Did your family go on vacations? What were they like?</li><li>Were extended family gatherings warm or complicated — or both?</li><li>Is there one holiday memory that still stands out?</li></ul><p><strong>Closing the memory walk</strong></p><p><strong>Leader:  </strong>Let’s come back to the room we’re in now. Thank you for going back there with me. What you just remembered — the smells, the rooms, the people who were there and the people who weren’t — that is part of your basement. The patterns we talked about earlier? You just saw some of them in those rooms. The fact that you can go back there and remember is not weakness. That is the beginning of understanding.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Pause 10 seconds after this before moving into private reflection. Let the room be still.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>5 min</strong></p></td><td><p><strong>PRIVATE REFLECTION — Memory walk notes</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>Take a few minutes to write privately. On your handout, finish one or both of these sentences:</p><ul><li>‘In one of those rooms, I see the pathway I named earlier operating because…’</li><li>‘Something I noticed in the memory walk that I want to hold onto is…’</li></ul><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Allow 4–5 minutes of quiet writing with music continuing. These notes stay private and are not shared. They serve as a personal anchor for the teaching that follows. After writing time, transition directly into the Gifts teaching.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 6  ·  Teaching — Gifts Passed Down Through Hard Things</strong></p><p>8 minutes  ·  Slide 10</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>8 min</strong></p></td><td><p><strong>TEACHING — Gifts passed down through hard things  —  Slide 10</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Why this teaching belongs here — after the memory walk</strong></p><p>The memory walk and pathway reflection have been honest and, for many women, heavy. The gifts teaching is the essential turn — not away from what was hard, but deeper into the same material. The basement doesn’t only hold damage. Naming what was also gained changes the entire emotional register of the session.</p></td></tr></tbody></table><p><strong>Leader:  </strong>Before we move on, I want to ask a different question. Because here’s what I know: the basement doesn’t only hold damage. It also holds what the hard things made you. The strength that got forged in the fire. The wisdom that came from surviving something. The compassion you have for others because of what you went through yourself.</p><p><strong>Leader:  </strong>The hard things in those boxes? They gave you something too. Let me show you what I mean.</p><table><thead><tr><th><p><strong>From what was inherited</strong></p></th><th><p><strong>From what was stored</strong></p></th><th><p><strong>From what was buried</strong></p></th></tr></thead><tbody><tr><td><p>Resourcefulness from growing up without enough<br>Tenacity — you kept going when the template said to stop<br>A protective instinct toward people you love<br>The decision that it would be different for your children</p></td><td><p>Depth of feeling — you are not numb, and that is a grace<br>Compassion for people in pain because you know what it weighs<br>Loyalty — you held on when holding on cost you something<br>The knowledge that you can survive more than you thought</p></td><td><p>Courage — you are in this room, which proves it<br>Honesty with yourself that many people never develop<br>Spiritual hunger — the buried things often drive us toward God<br>A story worth telling that will one day help someone else</p></td></tr></tbody></table><p><strong>Leader:  </strong>The basement holds the hard things. It also holds what the hard things made you. Both are true.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Allow this to settle before moving into the circle. Some women may look surprised — they have rarely been invited to look at their pain as a source of strength. Let the idea land. Then give the circle instruction.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>PART 7  ·  Circle Sharing — A Gift Received Through Difficulty</strong></p><p>10 minutes  ·  Slide 11</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>10 min</strong></p></td><td><p><strong>CIRCLE SHARING — Name one gift received through difficulty  —  Slide 11  ·  every voice</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>I want us to go around the circle. When it’s your turn, name one strength you have today that came from something hard. It can be one sentence. ‘Because I grew up with nothing, I know how to make something out of nothing.’ ‘Because I carried grief alone, I can sit with other people in theirs.’ ‘Because I survived what I survived, I know I am stronger than I look.’</p><p><strong>Leader:  </strong>You can look at the table on the slide if it helps. You don’t have to choose from the list — your gift might be something different entirely. One sentence. I’ll start.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>SHARE FIRST. Model the vulnerability and the specificity you want. Name a real hard thing and a real strength it built — keep it to two sentences. Then go around the circle. If someone struggles, offer gently: ‘Is there something the hard things made in you that you’d be willing to name? Even something small?’ Do not skip anyone. After the full circle, close with the line below.</em></p></td></tr></tbody></table><p><strong>Leader:  </strong>Thank you. Look around this room. Every woman here just named something that was forged in fire. That is not ordinary. That is what it looks like when people choose to be more than what happened to them. The basement holds both. And so do you.</p><table><tbody><tr><td><p><strong>PART 8  ·  Introducing the Genogram</strong></p><p>10 minutes  ·  Slide 20  ·  Send-home assignment</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>10 min</strong></p></td><td><p><strong>GENOGRAM INTRO — Send-home assignment  —  Slide 20</strong></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>Why introduce the genogram here — at the end?</strong></p><p>After the pathway teaching, memory walk, and gifts circle, women are primed in exactly the right way for the genogram. They have named which pathway is most active. They have walked through their childhood rooms. They have been invited to see both the hard things and the strengths in their family line. The genogram gives all of that a structure to flow into at home this week.</p></td></tr></tbody></table><p><strong>Leader:  </strong>Over the next few weeks we’re going to do one of the most powerful exercises of this year. It’s called a genogram — and it’s a map of your family. Not just names and dates. Patterns. The things that kept showing up. The behaviors and wounds that traveled from one generation to the next without anyone choosing them.</p><p><strong>Leader:  </strong>A genogram maps the pathways we just talked about. Addiction, silence, abandonment. But also faith, resilience, and strength. The people who held on. Both directions.</p><p><strong>Leader:  </strong>Today I’m just giving you the handout and asking you to start thinking. This week, sketch your family structure — just names and relationships, whoever you can remember. Don’t worry about patterns yet. Don’t worry about what you don’t know — a question mark is a completely valid answer. Bring it back next week and we’ll build it together.</p><p><strong>Symbol key — walk through this with participants</strong></p><table><thead><tr><th><p><strong>SYMBOL</strong></p></th><th><p><strong>MEANING</strong></p></th></tr></thead><tbody><tr><td><p><strong>□  Square</strong></p></td><td><p>Male in the family</p></td></tr><tr><td><p><strong>○  Circle</strong></p></td><td><p>Female in the family</p></td></tr><tr><td><p><strong>X  (over the shape)</strong></p></td><td><p>Deceased</p></td></tr><tr><td><p><strong>Horizontal line</strong></p></td><td><p>Marriage or committed relationship</p></td></tr><tr><td><p><strong>Word or color near symbol</strong></p></td><td><p>Pattern or characteristic — e.g., ‘addiction,’ ‘faith,’ ‘silence’</p></td></tr><tr><td><p><strong>?</strong></p></td><td><p>Unknown — always a valid answer</p></td></tr><tr><td><p><strong>★  Star or circle</strong></p></td><td><p>Strength, resilience — someone who broke a cycle</p></td></tr></tbody></table><p><strong>Leader:  </strong>This is private. It belongs only to you. You choose what to put on it and you choose what to share. The only goal is understanding — your own family line, seen clearly, maybe for the first time.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Distribute the genogram handout. Answer any clarifying questions briefly. Keep the mood light and curious. Send them home with: ‘Just the people this week. Don’t worry about the patterns yet. We’ll do that together.’</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>CLOSING  ·  Prayer</strong></p><p>5 minutes  ·  Slide 21</p></td></tr></tbody></table><table><tbody><tr><td><p><strong>5 min</strong></p></td><td><p><strong>CLOSING PRAYER — Slide 21</strong></p></td></tr></tbody></table><p><strong>Leader:  </strong>Going into the basement does not mean getting stuck there. We went down there today to see. And everything we saw, we’re going to bring into the light — the light of who God says we are, and the future He has for us and for our children.</p><p><strong>Leader:  </strong>You went somewhere today. You named some hard things. You named some gifts. That was brave. Take care of yourself this week. And bring back your genogram sketch next week — we’ll go deeper together.</p><table><tbody><tr><td><p><strong>FACILITATOR NOTE:  </strong><em>Close with a spoken prayer that is warm and forward-looking. Acknowledge the courage it took to come today. Thank God for what He is going to do with what was seen. Speak life over each woman and her children. End with Deuteronomy 30:19.</em></p></td></tr></tbody></table><table><tbody><tr><td><p><strong>The basement holds the hard things.</strong></p><p><em>It also holds what the hard things made you. Both are true.</em></p><p><strong>“Choose life, so that you and your children may live.”  — Deuteronomy 30:19</strong></p></td></tr></tbody></table><p>The Basement  ·  Session 1  ·  Built to Last  ·  Sparrow LifeChange Program</p>$tg$, 0
where exists (select 1 from lcp_sessions where session_number = 5)
  and not exists (
    select 1 from lcp_resources
    where kind = 'teacher_guide' 
      and session_id = (select id from lcp_sessions where session_number = 5)
  );

insert into lcp_resources (session_id, kind, audience, title, content, sort_order)
select (select id from lcp_sessions where session_number = 5), 'devotional', 'participant', 'Basement Day 1 — In the beginning, everything was good', $d1$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sparrow LifeChange Program — Basement Day 1</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: 'Jost', Georgia, sans-serif; padding: 32px 16px 64px; color: #1A1A1A; }
  .email-wrap { max-width: 600px; margin: 0 auto; }
  .header { background: #0A2420; padding: 36px 40px 32px; text-align: center; }
  .logo-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
  .logo-text { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(200,160,32,0.75); }
  .unit-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #5A9878; margin-bottom: 10px; }
  .day-label { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(200,160,32,0.6); margin-bottom: 16px; }
  .header-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; font-weight: 300; line-height: 1.2; color: #FFFFFF; margin-bottom: 8px; }
  .header-title em { font-style: italic; color: #E8C84A; }
  .gold-rule { width: 80px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 20px auto 0; }
  .scripture-banner { background: #1E5045; padding: 24px 36px; border-left: 3px solid #C8A020; }
  .scripture-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FAF7F0; line-height: 1.6; margin-bottom: 8px; }
  .scripture-ref { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #C8A020; text-align: right; }
  .body-card { background: #FFFFFF; padding: 40px 40px 36px; }
  .greeting { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: #133028; margin-bottom: 24px; }
  .body-text { font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 20px; }
  .body-text strong { font-weight: 500; color: #133028; }
  .body-text em { font-style: italic; }
  .section-head { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #C8A020; margin: 36px 0 14px; display: flex; align-items: center; gap: 12px; }
  .section-head::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #C8A020, transparent); opacity: 0.3; }
  .inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; padding: 16px 20px; margin: 24px 0; }
  .inline-scripture p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; color: #133028; line-height: 1.6; margin-bottom: 6px; }
  .inline-scripture span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase; }
  .context-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 10px; opacity: 0.7; }
  .scripture-context p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; font-style: italic; color: #133028; line-height: 1.65; margin-bottom: 10px; }
  .testimony-block { background: #F5F0E8; border-top: 3px solid #8A6E08; padding: 24px 28px; margin: 32px 0; }
  .testimony-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 14px; }
  .testimony-text { font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; line-height: 1.9; color: #2A2A2A; }
  .testimony-text em { font-style: italic; }
  .testimony-text strong { font-weight: 500; color: #133028; }
  .truth-card { background: #FBF5D8; border: 1px solid rgba(200,160,32,0.3); border-left: 4px solid #C8A020; padding: 20px 24px; margin: 28px 0; }
  .truth-card-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 10px; }
  .truth-card-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 400; color: #1A1A0A; line-height: 1.55; }
  .breathe-block { background: #F5F2EA; border-top: 3px solid #2A5C38; padding: 28px 40px 24px; }
  .breathe-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #2A5C38; margin-bottom: 12px; }
  .breathe-invite { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-style: italic; color: #375240; line-height: 1.7; margin-bottom: 20px; }
  .breathe-cue { display: flex; align-items: center; justify-content: center; gap: 20px; }
  .breathe-step { text-align: center; }
  .breathe-count { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; font-weight: 300; color: #2A5C38; line-height: 1; margin-bottom: 4px; }
  .breathe-word { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #6B8A72; }
  .breathe-divider { width: 1px; height: 32px; background: rgba(42,92,56,0.2); margin-bottom: 14px; }
  .prayer-block { background: #0A2420; padding: 32px 40px; }
  .prayer-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #C8A020; margin-bottom: 16px; }
  .prayer-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.8; margin-bottom: 12px; }
  .prayer-close { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 400; color: #C8A020; text-align: right; letter-spacing: 0.08em; }
  .family-thread { background: #1A3830; border-top: 2px solid rgba(200,160,32,0.25); padding: 26px 36px; }
  .family-thread-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.65); margin-bottom: 14px; }
  .family-thread-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.85; }
  .worship-block { background: #1A3830; padding: 24px 40px; text-align: center; border-top: 2px solid rgba(200,160,32,0.3); }
  .worship-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.7); margin-bottom: 12px; }
  .worship-song { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FFFFFF; margin-bottom: 4px; }
  .worship-artist { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); margin-bottom: 16px; letter-spacing: 0.08em; }
  .worship-btn { display: inline-flex; align-items: center; gap: 8px; background: #C8A020; color: #0A2420; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; padding: 10px 22px; text-decoration: none; border-radius: 2px; }
  .worship-btn:hover { background: #E8C84A; }
  .footer { background: #133028; padding: 20px 40px; text-align: center; }
  .footer p { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); line-height: 1.7; }
  .footer em { font-style: italic; color: rgba(216,237,232,0.75); }
  .day-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background: #0C1E18; }
  .day-nav span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(200,160,32,0.4); }
  .day-dots { display: flex; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(200,160,32,0.2); }
  .dot.active { background: #C8A020; }
  details.inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; margin: 24px 0; }
  details.inline-scripture summary { padding: 16px 20px; cursor: pointer; list-style: none; -webkit-appearance: none; }
  details.inline-scripture summary::-webkit-details-marker { display: none; }
  details.inline-scripture summary:hover { background: rgba(42,122,101,0.05); }
  details.inline-scripture summary p { margin-bottom: 6px; }
  .scripture-expand-label { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #2A7A65; }
  .scripture-expand-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.inline-scripture[open] .arrow { transform: rotate(90deg); }
  details.inline-scripture[open] .toggle-text-closed { display: none; }
  details.inline-scripture:not([open]) .toggle-text-open { display: none; }
  .scripture-context-inner { padding: 0 20px 16px 20px; border-top: 1px solid rgba(42,122,101,0.2); padding-top: 14px; }
</style>
</head>
<body>
<div class="email-wrap">

  <div class="header">
    <div class="logo-row"><span class="logo-text">Sparrow LifeChange Program</span></div>
    <div class="unit-label">The Basement &nbsp;&middot;&nbsp; Week 1</div>
    <div class="day-label">Day 1 of 20 &nbsp;&middot;&nbsp; Monday</div>
    <div class="header-title">In the beginning,<br>everything was <em>good.</em></div>
    <div class="gold-rule"></div>
  </div>

  <div class="scripture-banner">
    <div class="scripture-text">"God saw all that he had made, and it was very good."</div>
    <div class="scripture-ref">Genesis 1:31</div>
  </div>

  <div class="breathe-block">
    <div class="breathe-label">Before you read — just stop for a moment</div>
    <p class="breathe-invite">You are about to step into a story that started long before you were born — and runs all the way to you. Take a breath before we begin.</p>
    <div class="breathe-cue">
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">Breathe in</div></div>
      <div class="breathe-divider"></div>
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">Hold</div></div>
      <div class="breathe-divider"></div>
      <div class="breathe-step"><div class="breathe-count">6</div><div class="breathe-word">Breathe out</div></div>
    </div>
  </div>

  <div class="body-card">
    <div class="greeting">Good morning, friend.</div>
    <div class="section-head">Where the story begins</div>

    <p class="body-text">
      Last month you built a foundation — who God is, what Jesus did, who the Holy Spirit is, and who you are in the middle of all of it. Now we go deeper. This month we step into the basement, and the basement is where the story begins. Over the next twenty days you will meet real people — men and women who doubted and believed and ran and came back, who wrestled with God in the dark and limped away blessed. This is a family history. And if you want to belong to it, every name in it becomes yours.
    </p>
    <p class="body-text">
      We start at the very beginning. Before sin, before brokenness — there was a garden. And in that garden, everything was exactly what God designed it to be.
    </p>

    <div class="section-head">The story</div>

    <p class="body-text">
      In the beginning there was nothing, and then God spoke, and things came into existence. Light. Land. Sea. Every creature that moves. After each day He looked at what He had made and called it good. Then He did something different. He formed a man from the dust of the ground and breathed His own breath into him. He placed him in a garden — lush, full, with rivers running through it. Then, because it was not good for the man to be alone, He made a woman, and when Adam saw her he said: <em>at last.</em>
    </p>
    <p class="body-text">
      They were naked and felt no shame. That detail is easy to skip past, but it matters. To be fully seen — and feel completely safe. No hiding, no walls, no fear of what someone will think if they see the real you. That was the original design.
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"Then the Lord God formed a man from the dust of the ground and breathed into his nostrils the breath of life, and the man became a living being."</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Genesis 2:7</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 2:7–9, 15–17</div>
        <p>"Then the Lord God formed a man from the dust of the ground and breathed into his nostrils the breath of life, and the man became a living being. Now the Lord God had planted a garden in the east, in Eden; and there he put the man he had formed. The Lord God made all kinds of trees grow out of the ground — trees that were pleasing to the eye and good for food. In the middle of the garden were the tree of life and the tree of the knowledge of good and evil... The Lord God took the man and put him in the Garden of Eden to work it and take care of it. And the Lord God commanded the man, 'You are free to eat from any tree in the garden; but you must not eat from the tree of the knowledge of good and evil, for when you eat from it you will certainly die.'"</p>
      </div>
    </details>

    <p class="body-text">
      Into this world came a voice they didn't recognize as dangerous. The serpent approached the woman with a question designed to plant doubt: <em>Did God really say that?</em> It is still the oldest trick — not a full lie, just a nudge toward wondering whether God can be trusted, whether He is perhaps holding something back. She took the fruit. She gave some to her husband. He ate.
    </p>
    <p class="body-text">
      In that moment, something broke. They knew they were naked. Where before that felt like intimacy, now it felt like exposure. They hid. They covered themselves. When God came walking in the garden, the way He always did, He called out to them — <em>Where are you?</em> Not because He didn't know. Because He was giving them the chance to come out. <strong>He was looking for them the moment they ran.</strong>
    </p>
    <p class="body-text">
      They were removed from the garden. The world that had been very good was cracked. And yet — even in that moment, God made them something to wear. He clothed them. Even in the greatest rupture in human history, He covered them first.
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"But the Lord God called to the man, 'Where are you?' He answered, 'I heard you in the garden, and I was afraid because I was naked; so I hid.'"</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Genesis 3:9–10</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 3:8–13, 21</div>
        <p>"Then the man and his wife heard the sound of the Lord God as he was walking in the garden in the cool of the day, and they hid from the Lord God among the trees of the garden. But the Lord God called to the man, 'Where are you?' He answered, 'I heard you in the garden, and I was afraid because I was naked; so I hid.' And he said, 'Who told you that you were naked? Have you eaten from the tree that I commanded you not to eat from?' The man said, 'The woman you put here with me — she gave me some fruit from the tree, and I ate it.' Then the Lord God said to the woman, 'What is this you have done?' The woman said, 'The serpent deceived me, and I ate'... The Lord God made garments of skin for Adam and his wife and clothed them."</p>
      </div>
    </details>

    <p class="body-text">
      This is where every human story begins — not in failure, but in design. You were made by a God who looked at what He made and called it <em>very good.</em> You carry His image. And you live in a world that is cracked, and you feel that in your own life. That is not a mystery. It is the oldest wound. <strong>But the whole Bible is the story of God refusing to leave the people He made.</strong> This is where that story begins.
    </p>

    <div class="testimony-block">
      <div class="testimony-label">This is still happening &nbsp;&middot;&nbsp; A story from our community</div>
      <p class="testimony-text">
        A young mom came to one of our meetings years ago carrying something she had never told a single person. Something that had happened to her as a child. We had been talking that night about the cost of hiding — how secrets keep us small, how being known is the very thing we were made for. And she decided, for the first time, to come out from behind hers.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        She told the room what had happened. She wept as she said it. And the women around her did not flinch, did not judge, did not pull back. They moved closer. They held it with her. <strong>For the first time in her life, someone knew the real thing — and she was still loved.</strong> She walked out of that room lighter than she had walked in. Not because the past had changed, but because she was no longer carrying it alone. Her sisters knew. And they were still standing with her.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        That is what God designed the garden to feel like. That is what He is still doing — through rooms like that one, through women willing to stay, through the courage of one person deciding it is finally time to stop hiding.
      </p>
    </div>

    <div class="truth-card">
      <div class="truth-card-label">One truth to carry today</div>
      <div class="truth-card-text">"You were not made for hiding. You were made for the garden — fully seen, fully safe, no shame. The world is cracked, but the God who made you has been looking for you ever since you ran. He is still asking: where are you?"</div>
    </div>
  </div>

  <div class="prayer-block">
    <div class="prayer-label">A prayer for today</div>
    <div class="prayer-text">God, I have spent a lot of my life hiding — what I feel, what I have done, who I really am. Even from You. Today I want to come out. You clothed them anyway. Would You clothe me too? I am standing here, and I am not hiding anymore.</div>
    <div class="prayer-close">Amen &nbsp;&middot;&nbsp; Day 1 &nbsp;&middot;&nbsp; The Basement</div>
  </div>

  <div class="family-thread">
    <div class="family-thread-label">Your family &nbsp;&middot;&nbsp; Adam &amp; Eve</div>
    <div class="family-thread-text">Adam and Eve were the first people to know what it felt like to be fully known and fully loved — and the first to hide. They lived with the weight of what they had broken, and yet God clothed them anyway. The gift they left us is this: hiding doesn't work, and God comes looking regardless. They never knew your name. But God did. He was already writing you into this family before you were born. If that is what you want, you're invited in. It's yours.</div>
  </div>

  <div class="worship-block">
    <div class="worship-label">Worship &nbsp;&middot;&nbsp; A song to carry this truth</div>
    <div class="worship-song">"Death Was Arrested"</div>
    <div class="worship-artist">North Point Worship</div>
    <a href="https://www.youtube.com/watch?v=bBIm7-ogo5I" target="_blank" rel="noopener noreferrer" class="worship-btn">
      ▶ &nbsp; Listen on YouTube
    </a>
  </div>

  <div class="day-nav">
    <span>Week 1 of 4</span>
    <div class="day-dots">
      <div class="dot active"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>
    <span>Day 1 of 20</span>
  </div>

  <div class="footer">
    <p>Sparrow LifeChange Program &nbsp;&middot;&nbsp; Corvallis, OR</p>
    <p style="margin-top:10px;">Tomorrow: <em>Noah — God keeps His covenant even when the world is underwater</em></p>
  </div>

</div>
</body>
</html>
$d1$, 0
where exists (select 1 from lcp_sessions where session_number = 5)
  and not exists (
    select 1 from lcp_resources
    where kind = 'devotional' and sort_order = 0
      and session_id = (select id from lcp_sessions where session_number = 5)
  );

insert into lcp_resources (session_id, kind, audience, title, content, sort_order)
select (select id from lcp_sessions where session_number = 5), 'devotional', 'participant', 'Basement Day 2 — Noah', $d2$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sparrow LifeChange Program — Basement Day 2</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: 'Jost', Georgia, sans-serif; padding: 32px 16px 64px; color: #1A1A1A; }
  .email-wrap { max-width: 600px; margin: 0 auto; }
  .header { background: #0A2420; padding: 36px 40px 32px; text-align: center; }
  .logo-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
  .logo-text { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(200,160,32,0.75); }
  .unit-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #5A9878; margin-bottom: 10px; }
  .day-label { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(200,160,32,0.6); margin-bottom: 16px; }
  .header-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; font-weight: 300; line-height: 1.2; color: #FFFFFF; margin-bottom: 8px; }
  .header-title em { font-style: italic; color: #E8C84A; }
  .gold-rule { width: 80px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 20px auto 0; }
  .scripture-banner { background: #1E5045; padding: 24px 36px; border-left: 3px solid #C8A020; }
  .scripture-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FAF7F0; line-height: 1.6; margin-bottom: 8px; }
  .scripture-ref { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #C8A020; text-align: right; }
  .body-card { background: #FFFFFF; padding: 40px 40px 36px; }
  .greeting { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: #133028; margin-bottom: 24px; }
  .body-text { font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 20px; }
  .body-text strong { font-weight: 500; color: #133028; }
  .body-text em { font-style: italic; }
  .section-head { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #C8A020; margin: 36px 0 14px; display: flex; align-items: center; gap: 12px; }
  .section-head::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #C8A020, transparent); opacity: 0.3; }
  .inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; padding: 16px 20px; margin: 24px 0; }
  .inline-scripture p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; color: #133028; line-height: 1.6; margin-bottom: 6px; }
  .inline-scripture span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase; }
  .context-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 10px; opacity: 0.7; }
  .scripture-context p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; font-style: italic; color: #133028; line-height: 1.65; margin-bottom: 10px; }
  .testimony-block { background: #F5F0E8; border-top: 3px solid #8A6E08; padding: 24px 28px; margin: 32px 0; }
  .testimony-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 14px; }
  .testimony-text { font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; line-height: 1.9; color: #2A2A2A; }
  .testimony-text em { font-style: italic; }
  .testimony-text strong { font-weight: 500; color: #133028; }
  .truth-card { background: #FBF5D8; border: 1px solid rgba(200,160,32,0.3); border-left: 4px solid #C8A020; padding: 20px 24px; margin: 28px 0; }
  .truth-card-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 10px; }
  .truth-card-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 400; color: #1A1A0A; line-height: 1.55; }
  .breathe-block { background: #F5F2EA; border-top: 3px solid #2A5C38; padding: 28px 40px 24px; }
  .breathe-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #2A5C38; margin-bottom: 12px; }
  .breathe-invite { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-style: italic; color: #375240; line-height: 1.7; margin-bottom: 20px; }
  .breathe-cue { display: flex; align-items: center; justify-content: center; gap: 20px; }
  .breathe-step { text-align: center; }
  .breathe-count { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; font-weight: 300; color: #2A5C38; line-height: 1; margin-bottom: 4px; }
  .breathe-word { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #6B8A72; }
  .breathe-divider { width: 1px; height: 32px; background: rgba(42,92,56,0.2); margin-bottom: 14px; }
  .prayer-block { background: #0A2420; padding: 32px 40px; }
  .prayer-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #C8A020; margin-bottom: 16px; }
  .prayer-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.8; margin-bottom: 12px; }
  .prayer-close { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 400; color: #C8A020; text-align: right; letter-spacing: 0.08em; }
  .family-thread { background: #1A3830; border-top: 2px solid rgba(200,160,32,0.25); padding: 26px 36px; }
  .family-thread-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.65); margin-bottom: 14px; }
  .family-thread-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.85; }
  .worship-block { background: #1A3830; padding: 24px 40px; text-align: center; border-top: 2px solid rgba(200,160,32,0.3); }
  .worship-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.7); margin-bottom: 12px; }
  .worship-song { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FFFFFF; margin-bottom: 4px; }
  .worship-artist { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); margin-bottom: 16px; letter-spacing: 0.08em; }
  .worship-btn { display: inline-flex; align-items: center; gap: 8px; background: #C8A020; color: #0A2420; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; padding: 10px 22px; text-decoration: none; border-radius: 2px; }
  .worship-btn:hover { background: #E8C84A; }
  .footer { background: #133028; padding: 20px 40px; text-align: center; }
  .footer p { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); line-height: 1.7; }
  .footer em { font-style: italic; color: rgba(216,237,232,0.75); }
  .day-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background: #0C1E18; }
  .day-nav span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(200,160,32,0.4); }
  .day-dots { display: flex; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(200,160,32,0.2); }
  .dot.active { background: #C8A020; }
  details.inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; margin: 24px 0; }
  details.inline-scripture summary { padding: 16px 20px; cursor: pointer; list-style: none; -webkit-appearance: none; }
  details.inline-scripture summary::-webkit-details-marker { display: none; }
  details.inline-scripture summary:hover { background: rgba(42,122,101,0.05); }
  details.inline-scripture summary p { margin-bottom: 6px; }
  .scripture-expand-label { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #2A7A65; }
  .scripture-expand-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.inline-scripture[open] .arrow { transform: rotate(90deg); }
  details.inline-scripture[open] .toggle-text-closed { display: none; }
  details.inline-scripture:not([open]) .toggle-text-open { display: none; }
  .scripture-context-inner { padding: 0 20px 16px 20px; border-top: 1px solid rgba(42,122,101,0.2); padding-top: 14px; }
</style>
</head>
<body>
<div class="email-wrap">

  <div class="header">
    <div class="logo-row"><span class="logo-text">Sparrow LifeChange Program</span></div>
    <div class="unit-label">The Basement &nbsp;&middot;&nbsp; Week 1</div>
    <div class="day-label">Day 2 of 20</div>
    <div class="header-title">God keeps His promises<br>even when the world is <em>underwater.</em></div>
    <div class="gold-rule"></div>
  </div>

  <div class="scripture-banner">
    <div class="scripture-text">"I have set my rainbow in the clouds, and it will be the sign of the covenant between me and the earth."</div>
    <div class="scripture-ref">Genesis 9:13</div>
  </div>

  <div class="breathe-block">
    <div class="breathe-label">Before you read — just stop for a moment</div>
    <p class="breathe-invite">You are continuing a story that has been unfolding for a very long time. You did not arrive at this place alone. Take a breath before we begin.</p>
    <div class="breathe-cue">
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">Breathe in</div></div>
      <div class="breathe-divider"></div>
      <div class="breathe-step"><div class="breathe-count">4</div><div class="breathe-word">Hold</div></div>
      <div class="breathe-divider"></div>
      <div class="breathe-step"><div class="breathe-count">6</div><div class="breathe-word">Breathe out</div></div>
    </div>
  </div>

  <div class="body-card">
    <div class="greeting">Hello, friend.</div>
    <div class="section-head">After the fall, things got worse</div>

    <p class="body-text">
      Yesterday we stood in the garden. We watched the original design shatter. And we saw God come looking anyway, clothing the ones He made even as they were being sent away. Today we take the next step — and it is not pretty. Things did not get better after the fall. They got worse. Violence spread. Darkness deepened. And God looked at what the world had become and <em>grieved.</em>
    </p>
    <p class="body-text">
      But He did not abandon the world. He found one man — ordinary, flawed, faithful — and He made him a promise that was really a promise to all of us.
    </p>

    <div class="section-head">The story</div>

    <p class="body-text">
      Noah's story is often softened into a children's tale: the ark, the animals, the rainbow. But read carefully, it is one of the most devastating and most hopeful passages in the entire Bible. God looked at the earth and saw that every inclination of the human heart had become evil. And it grieved Him. The word used carries the weight of deep pain — like a parent watching a child destroy themselves and being unable to stop them.
    </p>
    <p class="body-text">
      He decided to start again. And He chose Noah — not because Noah was perfect, but because he was the one walking with God in a generation that had stopped. Noah built a boat on dry ground for a flood that had never been seen, because God told him to. That took decades. The people around him would have thought he had lost his mind. And yet he built, day after day, year after year. <strong>He believed God when there was no visible reason to believe.</strong>
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"Noah was a righteous man, blameless among the people of his time, and he walked faithfully with God."</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Genesis 6:9</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 6:5–8, 17–18</div>
        <p>"The Lord saw how great the wickedness of the human race had become on the earth, and that every inclination of the thoughts of the human heart was only evil all the time. The Lord regretted that he had made human beings on the earth, and his heart was deeply troubled... But Noah found favor in the eyes of the Lord... I am going to bring floodwaters on the earth to destroy all life... But I will establish my covenant with you, and you will enter the ark — you and your sons and your wife and your sons' wives with you."</p>
      </div>
    </details>

    <p class="body-text">
      The flood came. Everything was submerged. And then, after the water receded and Noah stepped out onto dry ground, God did something that changed everything: He made a covenant. Not a suggestion. Not a hopeful wish. A binding, irrevocable promise.
    </p>
    <p class="body-text">
      <strong>He promised never to destroy the earth by flood again. And He put a rainbow in the sky as a sign — not for Noah alone, but for every generation that would come after.</strong> Including yours. Including this morning, wherever you are sitting. If you have ever seen a rainbow and felt something in your chest — that is not coincidence. That is an ancient promise, still being kept.
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"Whenever I bring clouds over the earth and the rainbow appears in the clouds, I will remember my covenant between me and you and all living creatures of every kind."</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Genesis 9:14–15</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 9:12–16</div>
        <p>"And God said, 'This is the sign of the covenant I am making between me and you and every living creature with you, a covenant for all generations to come: I have set my rainbow in the clouds, and it will be the sign of the covenant between me and the earth. Whenever I bring clouds over the earth and the rainbow appears in the clouds, I will remember my covenant between me and you and all living creatures of every kind. Never again will the waters become a flood to destroy all life.'"</p>
      </div>
    </details>

    <div class="section-head">What this means for you</div>

    <p class="body-text">
      There is something in the Noah story that speaks directly to a particular kind of woman — the one who has been faithful in a generation that wasn't. The one who kept building when everyone around her thought she was wasting her time. The one who kept walking with God through the flood years when nothing made sense and the water was still rising.
    </p>
    <p class="body-text">
      God keeps His covenants. He did not make the promise and then forget it. He built a reminder into the sky. He made a sign that He would see and remember. That is the kind of God you are dealing with. He is not forgetful. He is not fickle. <strong>When He says He will do something, He does it — even when the world is underwater, even when the waiting is long, even when you are the only one still building.</strong>
    </p>

    <div class="testimony-block">
      <div class="testimony-label">This is still happening &nbsp;&middot;&nbsp; The story of Twin Oaks</div>
      <p class="testimony-text">
        When Sparrow was just starting out, Andrew had a dream about a family moving into a trailer park — and it set the direction for everything that followed. In those early years there was only one Sparrow house, not much structure, just showing up twice a week to be with the families God had given us. It was simple. It was faithful. But at some point a real concern surfaced: what would happen if the park owner decided to stop allowing sublease arrangements? The foundation of the whole ministry could be pulled out from under us.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        Right around that time, Andrew began hearing about a State of Oregon grant designed to help organizations purchase manufactured home parks — preserving them as affordable housing for low-income families. The idea of purchasing the very park where Sparrow's home sat seemed almost too good to be true. Then they found out the owner was open to selling. What followed was a long, uncertain process. <strong>Many times they thought about giving up. At different points the owner changed his mind, wavering on whether to sell at all.</strong> The water kept rising.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        In May 2021, Sparrow signed papers to become the owners of Twin Oaks Manufactured Home Park. It was a day of celebration. The grant. The willing owner. The timing. None of it could have been engineered. <strong>Only God could have brought all the pieces together — at just the right time, in just the right order.</strong> They kept building. The flood receded. And they stepped out onto dry ground.
      </p>
    </div>

    <div class="truth-card">
      <div class="truth-card-label">One truth to carry today</div>
      <div class="truth-card-text">"God keeps His covenants. He made a promise and put a sign in the sky so He would remember it. He has not forgotten what He has said to you either — not in the flood years, not in the waiting, not now."</div>
    </div>

    <div class="section-head">Sit with this today</div>
    <p class="body-text">
      Is there something God has promised you — through Scripture, through a moment of clarity, through a word spoken into your life — that you are still waiting for? What would it look like today to keep building, even if the rain hasn't stopped yet?
    </p>
  </div>

  <div class="prayer-block">
    <div class="prayer-label">A prayer for today</div>
    <div class="prayer-text">God, I have been in flood seasons. Some of them I am still in. Today I want to remember that You keep Your covenants. You put a rainbow in the sky so You would not forget — that means You take Your promises seriously. Help me trust You in the water. Help me keep building even when I cannot see dry ground. You were on the boat with Noah. You are with me too.</div>
    <div class="prayer-close">Amen &nbsp;&middot;&nbsp; Day 2 &nbsp;&middot;&nbsp; The Basement</div>
  </div>

  <div class="family-thread">
    <div class="family-thread-label">Your family &nbsp;&middot;&nbsp; Noah</div>
    <div class="family-thread-text">Noah never got to see the billions of people who would live because of his faithfulness. He just built the boat, day after day, because God told him to. He walked with God when no one else was walking that direction. And because he did, the story continued. You are in this family now — and part of what you carry is his particular gift: the ability to keep being faithful when the world around you has forgotten what faithfulness looks like.</div>
  </div>

  <div class="worship-block">
    <div class="worship-label">Worship &nbsp;&middot;&nbsp; A song to carry this truth</div>
    <div class="worship-song">"Promises"</div>
    <div class="worship-artist">Maverick City Music feat. Joe L Barnes &amp; Naomi Raine</div>
    <a href="https://www.youtube.com/watch?v=q5m09rqOoxE&list=RDq5m09rqOoxE&start_radio=1" target="_blank" rel="noopener noreferrer" class="worship-btn">
      &#9654; &nbsp; Listen on YouTube
    </a>
  </div>

  <div class="day-nav">
    <span>Week 1 of 4</span>
    <div class="day-dots">
      <div class="dot"></div><div class="dot active"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>
    <span>Day 2 of 20</span>
  </div>

  <div class="footer">
    <p>Sparrow LifeChange Program &nbsp;&middot;&nbsp; Corvallis, OR</p>
    <p style="margin-top:10px;">Tomorrow: <em>Abraham — the man who left everything on the word of God</em></p>
  </div>

</div>
</body>
</html>
$d2$, 1
where exists (select 1 from lcp_sessions where session_number = 5)
  and not exists (
    select 1 from lcp_resources
    where kind = 'devotional' and sort_order = 1
      and session_id = (select id from lcp_sessions where session_number = 5)
  );

insert into lcp_resources (session_id, kind, audience, title, content, sort_order)
select (select id from lcp_sessions where session_number = 5), 'devotional', 'participant', 'Basement Day 3 — Abraham', $d3$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sparrow LifeChange Program — Basement Day 3</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: 'Jost', Georgia, sans-serif; padding: 32px 16px 64px; color: #1A1A1A; }
  .email-wrap { max-width: 600px; margin: 0 auto; }
  .header { background: #0A2420; padding: 36px 40px 32px; text-align: center; }
  .logo-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
  .logo-text { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(200,160,32,0.75); }
  .unit-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #5A9878; margin-bottom: 10px; }
  .day-label { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(200,160,32,0.6); margin-bottom: 16px; }
  .header-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; font-weight: 300; line-height: 1.2; color: #FFFFFF; margin-bottom: 8px; }
  .header-title em { font-style: italic; color: #E8C84A; }
  .gold-rule { width: 80px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 20px auto 0; }
  .scripture-banner { background: #1E5045; padding: 24px 36px; border-left: 3px solid #C8A020; }
  .scripture-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FAF7F0; line-height: 1.6; margin-bottom: 8px; }
  .scripture-ref { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #C8A020; text-align: right; }
  .body-card { background: #FFFFFF; padding: 40px 40px 36px; }
  .greeting { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: #133028; margin-bottom: 24px; }
  .body-text { font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 20px; }
  .body-text strong { font-weight: 500; color: #133028; }
  .body-text em { font-style: italic; }
  .section-head { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #C8A020; margin: 36px 0 14px; display: flex; align-items: center; gap: 12px; }
  .section-head::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #C8A020, transparent); opacity: 0.3; }
  .inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; padding: 16px 20px; margin: 24px 0; }
  .inline-scripture p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; color: #133028; line-height: 1.6; margin-bottom: 6px; }
  .inline-scripture span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase; }
  .context-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 10px; opacity: 0.7; }
  .scripture-context p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; font-style: italic; color: #133028; line-height: 1.65; margin-bottom: 10px; }
  .testimony-block { background: #F5F0E8; border-top: 3px solid #8A6E08; padding: 24px 28px; margin: 32px 0; }
  .testimony-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 14px; }
  .testimony-text { font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; line-height: 1.9; color: #2A2A2A; }
  .testimony-text em { font-style: italic; }
  .testimony-text strong { font-weight: 500; color: #133028; }
  .truth-card { background: #FBF5D8; border: 1px solid rgba(200,160,32,0.3); border-left: 4px solid #C8A020; padding: 20px 24px; margin: 28px 0; }
  .truth-card-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 10px; }
  .truth-card-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 400; color: #1A1A0A; line-height: 1.55; }
  .prayer-block { background: #0A2420; padding: 32px 40px; }
  .prayer-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #C8A020; margin-bottom: 16px; }
  .prayer-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.8; margin-bottom: 12px; }
  .prayer-close { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 400; color: #C8A020; text-align: right; letter-spacing: 0.08em; }
  .family-thread { background: #1A3830; border-top: 2px solid rgba(200,160,32,0.25); padding: 26px 36px; }
  .family-thread-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.65); margin-bottom: 14px; }
  .family-thread-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.85; }
  .worship-block { background: #1A3830; padding: 24px 40px; text-align: center; border-top: 2px solid rgba(200,160,32,0.3); }
  .worship-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.7); margin-bottom: 12px; }
  .worship-song { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FFFFFF; margin-bottom: 4px; }
  .worship-artist { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); margin-bottom: 16px; letter-spacing: 0.08em; }
  .worship-btn { display: inline-flex; align-items: center; gap: 8px; background: #C8A020; color: #0A2420; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; padding: 10px 22px; text-decoration: none; border-radius: 2px; }
  .worship-btn:hover { background: #E8C84A; }
  .footer { background: #133028; padding: 20px 40px; text-align: center; }
  .footer p { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); line-height: 1.7; }
  .footer em { font-style: italic; color: rgba(216,237,232,0.75); }
  .day-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background: #0C1E18; }
  .day-nav span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(200,160,32,0.4); }
  .day-dots { display: flex; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(200,160,32,0.2); }
  .dot.active { background: #C8A020; }
  details.inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; margin: 24px 0; }
  details.inline-scripture summary { padding: 16px 20px; cursor: pointer; list-style: none; -webkit-appearance: none; }
  details.inline-scripture summary::-webkit-details-marker { display: none; }
  details.inline-scripture summary:hover { background: rgba(42,122,101,0.05); }
  details.inline-scripture summary p { margin-bottom: 6px; }
  .scripture-expand-label { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #2A7A65; }
  .scripture-expand-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.inline-scripture[open] .arrow { transform: rotate(90deg); }
  details.inline-scripture[open] .toggle-text-closed { display: none; }
  details.inline-scripture:not([open]) .toggle-text-open { display: none; }
  .scripture-context-inner { padding: 0 20px 16px 20px; border-top: 1px solid rgba(42,122,101,0.2); padding-top: 14px; }
</style>
</head>
<body>
<div class="email-wrap">

  <div class="header">
    <div class="logo-row"><span class="logo-text">Sparrow LifeChange Program</span></div>
    <div class="unit-label">The Basement &nbsp;&middot;&nbsp; Week 1</div>
    <div class="day-label">Day 3 of 20</div>
    <div class="header-title">The man who left everything<br>on the <em>word of God.</em></div>
    <div class="gold-rule"></div>
  </div>

  <div class="scripture-banner">
    <div class="scripture-text">"The Lord had said to Abram, 'Go from your country, your people and your father's household to the land I will show you.'"</div>
    <div class="scripture-ref">Genesis 12:1</div>
  </div>

  <div class="body-card">
    <div class="greeting">Hello, friend.</div>
    <div class="section-head">A man called out of everything familiar</div>

    <p class="body-text">
      Abraham was seventy-five years old when God told him to leave. He had a home, a community, a family name, roots that had been growing for decades. And God said: leave all of it. Go to a land I will show you — not <em>a land I will tell you about,</em> but <em>a land I will show you.</em> One step at a time. No map. No destination revealed in advance. Just: go, and I will show you as you go.
    </p>
    <p class="body-text">
      And Abraham went. The text says it simply: <em>so Abram went.</em> Three words that changed the course of human history.
    </p>

    <div class="section-head">The story</div>

    <p class="body-text">
      Abraham's life was not a straight line of faith. He lied about his wife twice — told powerful men she was his sister to protect himself. He took matters into his own hands with Hagar when the promise was taking too long. He laughed when God told him Sarah would bear a child in her old age. He was not a perfect man. He was a man who kept coming back to God, kept returning to the altar, kept walking in the direction of the promise even when he stumbled.
    </p>
    <p class="body-text">
      But the defining moment — the one that Scripture returns to again and again across the entire Bible — is not his failures. It is Genesis 22. God asked Abraham to take his son Isaac, the miracle child, the one the whole promise rested on, up a mountain and offer him as a sacrifice. And Abraham got up early in the morning and went.
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"Abraham reasoned that God could even raise the dead, and so in a manner of speaking he did receive Isaac back from death."</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Hebrews 11:19</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 22:1–2, 9–12</div>
        <p>"Some time later God tested Abraham. He said to him, 'Abraham!' 'Here I am,' he replied. Then God said, 'Take your son, your only son, whom you love — Isaac — and go to the region of Moriah. Sacrifice him there as a burnt offering on a mountain I will show you'... When they reached the place God had told him about, Abraham built an altar there and arranged the wood on it. He bound his son Isaac and laid him on the altar... But the angel of the Lord called out to him from heaven, 'Abraham! Abraham!' 'Here I am,' he replied. 'Do not lay a hand on the boy,' he said. 'Do not do anything to him. Now I know that you fear God, because you have not withheld from me your son, your only son.'"</p>
      </div>
    </details>

    <p class="body-text">
      He did not understand what God was doing. He could not see the end of the story. But he trusted that the God who had made the promise was able to keep it — even if it required something Abraham could not explain. And at the last moment, God stopped him. A ram appeared in the thicket. Isaac was spared. And Abraham named that place <em>The Lord Will Provide.</em>
    </p>
    <p class="body-text">
      <strong>What God was after was not the sacrifice. What God was after was the trust.</strong> He wanted to know: do you trust Me more than you hold the thing I gave you? That question never stops being asked. It is asked of every person who follows God. It is being asked of you.
    </p>

    <div class="testimony-block">
      <div class="testimony-label">This is still happening &nbsp;&middot;&nbsp; A story from our community</div>
      <p class="testimony-text">
        A family came into our LifeChange program a number of years ago — hurting, living in a shelter, unable to find housing. They embraced the process and dove into healing, working on difficult things. Somewhere in the middle of the program, they received the gift of Jesus and what He did for them on the cross. They were baptized in Mary's River. It was a joyful day.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        Later, a man in the community discovered he had cancer and needed help around his home. The family did odd jobs for him in exchange for pay, and a friendship grew. Over time, that man received Jesus himself — because of the testimony of this family and the love he felt from them. When he died, he left them his manufactured home as an inheritance.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        <strong>They had been wondering how they would ever get a home. They never knew what they were building when they offered friendship and small acts of kindness. But God saw. He always sees.</strong>
      </p>
    </div>

    <div class="truth-card">
      <div class="truth-card-label">One truth to carry today</div>
      <div class="truth-card-text">"We never know what we are building when we offer friendship and acts of kindness to others. Abraham left without knowing where he was going. A Sparrow family served a sick neighbor without knowing what God was preparing. God sees what we cannot. He is building something even when we are just showing up."</div>
    </div>

    <div class="section-head">Sit with this today</div>
    <p class="body-text">
      Is there someone in front of you right now — a neighbor, a coworker, a stranger — that God may have placed there on purpose? You may not see what He is building. Abraham didn't either. What would it look like to simply show up and trust that God sees the rest?
    </p>
  </div>

  <div class="prayer-block">
    <div class="prayer-label">A prayer for today</div>
    <div class="prayer-text">God, Abraham heard You and went. I want to be that kind of person. I am holding things tightly right now — some of them are things You gave me, and some of them are things I built myself because the waiting was too long. Today I am loosening my grip. Show me what You are asking me to trust You with. I will go to the land You show me.</div>
    <div class="prayer-close">Amen &nbsp;&middot;&nbsp; Day 3 &nbsp;&middot;&nbsp; The Basement</div>
  </div>

  <div class="family-thread">
    <div class="family-thread-label">Your family &nbsp;&middot;&nbsp; Abraham</div>
    <div class="family-thread-text">Abraham is called the father of faith — not because he was perfect, but because he kept returning to trust. Every time he wandered, he came back to the altar. Every time the promise seemed impossible, he held it anyway. Romans 4 tells us that his faith was credited to him as righteousness — and that the same promise extends to everyone who trusts God the way he did. That includes you. You are a daughter of Abraham. The promise made to him runs in your spiritual veins.</div>
  </div>

  <div class="worship-block">
    <div class="worship-label">Worship &nbsp;&middot;&nbsp; A song to carry this truth</div>
    <div class="worship-song">"Way Maker"</div>
    <div class="worship-artist">Sinach</div>
    <a href="https://www.youtube.com/watch?v=iJCV_2H9xD0&list=RDiJCV_2H9xD0&start_radio=1" target="_blank" rel="noopener noreferrer" class="worship-btn">
      &#9654; &nbsp; Listen on YouTube
    </a>
  </div>

  <div class="day-nav">
    <span>Week 1 of 4</span>
    <div class="day-dots">
      <div class="dot"></div><div class="dot"></div><div class="dot active"></div><div class="dot"></div><div class="dot"></div>
    </div>
    <span>Day 3 of 20</span>
  </div>

  <div class="footer">
    <p>Sparrow LifeChange Program &nbsp;&middot;&nbsp; Corvallis, OR</p>
    <p style="margin-top:10px;">Tomorrow: <em>Sarah — the woman who laughed, and then held the promise in her arms</em></p>
  </div>

</div>
</body>
</html>
$d3$, 2
where exists (select 1 from lcp_sessions where session_number = 5)
  and not exists (
    select 1 from lcp_resources
    where kind = 'devotional' and sort_order = 2
      and session_id = (select id from lcp_sessions where session_number = 5)
  );

insert into lcp_resources (session_id, kind, audience, title, content, sort_order)
select (select id from lcp_sessions where session_number = 5), 'devotional', 'participant', 'Basement Day 4 — Sarah', $d4$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sparrow LifeChange Program — Basement Day 4</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: 'Jost', Georgia, sans-serif; padding: 32px 16px 64px; color: #1A1A1A; }
  .email-wrap { max-width: 600px; margin: 0 auto; }
  .header { background: #0A2420; padding: 36px 40px 32px; text-align: center; }
  .logo-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
  .logo-text { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(200,160,32,0.75); }
  .unit-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #5A9878; margin-bottom: 10px; }
  .day-label { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(200,160,32,0.6); margin-bottom: 16px; }
  .header-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; font-weight: 300; line-height: 1.2; color: #FFFFFF; margin-bottom: 8px; }
  .header-title em { font-style: italic; color: #E8C84A; }
  .gold-rule { width: 80px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 20px auto 0; }
  .scripture-banner { background: #1E5045; padding: 24px 36px; border-left: 3px solid #C8A020; }
  .scripture-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FAF7F0; line-height: 1.6; margin-bottom: 8px; }
  .scripture-ref { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #C8A020; text-align: right; }
  .body-card { background: #FFFFFF; padding: 40px 40px 36px; }
  .greeting { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: #133028; margin-bottom: 24px; }
  .body-text { font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 20px; }
  .body-text strong { font-weight: 500; color: #133028; }
  .body-text em { font-style: italic; }
  .section-head { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #C8A020; margin: 36px 0 14px; display: flex; align-items: center; gap: 12px; }
  .section-head::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #C8A020, transparent); opacity: 0.3; }
  .inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; padding: 16px 20px; margin: 24px 0; }
  .inline-scripture p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; color: #133028; line-height: 1.6; margin-bottom: 6px; }
  .inline-scripture span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase; }
  .context-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 10px; opacity: 0.7; }
  .scripture-context p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; font-style: italic; color: #133028; line-height: 1.65; margin-bottom: 10px; }
  .testimony-block { background: #F5F0E8; border-top: 3px solid #8A6E08; padding: 24px 28px; margin: 32px 0; }
  .testimony-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 14px; }
  .testimony-text { font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; line-height: 1.9; color: #2A2A2A; }
  .testimony-text em { font-style: italic; }
  .testimony-text strong { font-weight: 500; color: #133028; }
  .truth-card { background: #FBF5D8; border: 1px solid rgba(200,160,32,0.3); border-left: 4px solid #C8A020; padding: 20px 24px; margin: 28px 0; }
  .truth-card-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 10px; }
  .truth-card-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 400; color: #1A1A0A; line-height: 1.55; }
  .prayer-block { background: #0A2420; padding: 32px 40px; }
  .prayer-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #C8A020; margin-bottom: 16px; }
  .prayer-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.8; margin-bottom: 12px; }
  .prayer-close { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 400; color: #C8A020; text-align: right; letter-spacing: 0.08em; }
  .family-thread { background: #1A3830; border-top: 2px solid rgba(200,160,32,0.25); padding: 26px 36px; }
  .family-thread-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.65); margin-bottom: 14px; }
  .family-thread-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.85; }
  .worship-block { background: #1A3830; padding: 24px 40px; text-align: center; border-top: 2px solid rgba(200,160,32,0.3); }
  .worship-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.7); margin-bottom: 12px; }
  .worship-song { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FFFFFF; margin-bottom: 4px; }
  .worship-artist { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); margin-bottom: 16px; letter-spacing: 0.08em; }
  .worship-btn { display: inline-flex; align-items: center; gap: 8px; background: #C8A020; color: #0A2420; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; padding: 10px 22px; text-decoration: none; border-radius: 2px; }
  .worship-btn:hover { background: #E8C84A; }
  .footer { background: #133028; padding: 20px 40px; text-align: center; }
  .footer p { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); line-height: 1.7; }
  .footer em { font-style: italic; color: rgba(216,237,232,0.75); }
  .day-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background: #0C1E18; }
  .day-nav span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(200,160,32,0.4); }
  .day-dots { display: flex; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(200,160,32,0.2); }
  .dot.active { background: #C8A020; }
  details.inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; margin: 24px 0; }
  details.inline-scripture summary { padding: 16px 20px; cursor: pointer; list-style: none; -webkit-appearance: none; }
  details.inline-scripture summary::-webkit-details-marker { display: none; }
  details.inline-scripture summary:hover { background: rgba(42,122,101,0.05); }
  details.inline-scripture summary p { margin-bottom: 6px; }
  .scripture-expand-label { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #2A7A65; }
  .scripture-expand-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.inline-scripture[open] .arrow { transform: rotate(90deg); }
  details.inline-scripture[open] .toggle-text-closed { display: none; }
  details.inline-scripture:not([open]) .toggle-text-open { display: none; }
  .scripture-context-inner { padding: 0 20px 16px 20px; border-top: 1px solid rgba(42,122,101,0.2); padding-top: 14px; }
</style>
</head>
<body>
<div class="email-wrap">

  <div class="header">
    <div class="logo-row"><span class="logo-text">Sparrow LifeChange Program</span></div>
    <div class="unit-label">The Basement &nbsp;&middot;&nbsp; Week 1</div>
    <div class="day-label">Day 4 of 20</div>
    <div class="header-title">She laughed.<br>Then she held the <em>promise in her arms.</em></div>
    <div class="gold-rule"></div>
  </div>

  <div class="scripture-banner">
    <div class="scripture-text">"Is anything too hard for the Lord? I will return to you at the appointed time next year, and Sarah will have a son."</div>
    <div class="scripture-ref">Genesis 18:14</div>
  </div>

  <div class="body-card">
    <div class="greeting">Hello, friend.</div>
    <div class="section-head">A woman who had stopped hoping</div>

    <p class="body-text">
      By the time the three visitors arrived at Abraham's tent, Sarah had been carrying the promise for decades. God had told her husband that she would bear a son. She had believed it once — maybe twice — maybe a handful of times in the early years when hope still felt possible. But she was ninety years old now. Her body had long since stopped being a place where life could begin. <strong>She had made peace with the silence the way you make peace with something that has been gone long enough to feel permanent.</strong>
    </p>
    <p class="body-text">
      So when she heard the visitor say it again — <em>Sarah will have a son</em> — she laughed. She laughed to herself, behind the tent curtain, where she thought no one could hear her. It was not a joyful laugh. It was the laugh of a woman who has stopped believing something is possible.
    </p>

    <div class="section-head">The story</div>

    <p class="body-text">
      God heard her. He always hears what happens behind the curtain. He said to Abraham: why did Sarah laugh? And then He asked the question that has been echoing through Scripture ever since: <em>Is anything too hard for the Lord?</em>
    </p>
    <p class="body-text">
      Sarah denied laughing. She was afraid. And God said: no, you did laugh. He did not shame her for it. He did not take back the promise. He named what happened and moved forward anyway. That is what God does with our doubt. He does not punish it. He does not pretend it didn't happen. He names it, and then He keeps the promise regardless.
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"Now the Lord was gracious to Sarah as he had said, and the Lord did for Sarah what he had promised. Sarah became pregnant and bore a son to Abraham in his old age, at the very time God had promised."</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Genesis 21:1–2</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 21:3–6</div>
        <p>"Abraham gave the name Isaac to the son Sarah bore him... Sarah said, 'God has brought me laughter, and everyone who hears about this will laugh with me.' And she added, 'Who would have said to Abraham that Sarah would nurse children? Yet I have borne him a son in his old age.'"</p>
      </div>
    </details>

    <p class="body-text">
      She named him Isaac. In Hebrew, the name means <em>laughter.</em> The very thing that had been her doubt became the name she spoke over the promise every single day. <strong>God redeemed the laugh. He turned her bitterness into the name of the thing He gave her.</strong>
    </p>
    <p class="body-text">
      There is something important about the detail that it happened at <em>the very time God had promised.</em> Not early. Not when Sarah wanted it. At the appointed time. The promise was never delayed — it was always on schedule, even when it looked like it had been forgotten. God does not forget His appointments.
    </p>

    <div class="testimony-block">
      <div class="testimony-label">This has happened before &nbsp;&middot;&nbsp; Monica and Augustine</div>
      <p class="testimony-text">
        Monica was a devoted Christian woman in fourth-century North Africa whose son Augustine broke her heart for decades. He rejected the faith she raised him in, embraced a philosophy she considered empty, took a mistress, and fathered a child outside of marriage. She prayed for his salvation for more than seventeen years. A bishop she went to for counsel told her: <em>"The child of those tears cannot perish."</em> But the years kept passing and Augustine kept drifting — further into philosophy, further into a life she could not recognize as the one God had for him.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        There must have been moments behind the curtain. Moments of private exhaustion, of praying the same prayer so many times the words felt hollow. She could not see what God was doing. She only knew she could not stop asking.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        In 386 AD, Augustine was converted. He went on to become one of the most significant theologians in the history of the Christian church — his writings on grace, faith, and the love of God have shaped the church for sixteen hundred years. Monica died shortly after his baptism, having held the promise in her arms. <strong>The appointed time had always existed. She just could not see it from where she was standing.</strong>
      </p>
    </div>

    <div class="truth-card">
      <div class="truth-card-label">One truth to carry today</div>
      <div class="truth-card-text">"Sarah's laugh did not stop the promise. God named her doubt, and then He kept the appointment anyway. He is not deterred by your unbelief. Is anything too hard for the Lord? Whatever you have stopped hoping for — He has not stopped working."</div>
    </div>

    <div class="section-head">Sit with this today</div>
    <p class="body-text">
      What promise have you quietly laughed at — convinced yourself was impossible, given up on in the private places? Let the name Isaac sit with you today: the thing you laughed at might be the name of the thing He gives you.
    </p>
  </div>

  <div class="prayer-block">
    <div class="prayer-label">A prayer for today</div>
    <div class="prayer-text">God, I have laughed. Maybe not out loud, but behind the curtain — I have let go of some things I once believed You would do. Today I am not pretending I haven't. You hear what happens behind the curtain anyway. So here is my doubt, and here is the question You already asked: is anything too hard for You? No. Nothing is. Help me hold on until the appointed time.</div>
    <div class="prayer-close">Amen &nbsp;&middot;&nbsp; Day 4 &nbsp;&middot;&nbsp; The Basement</div>
  </div>

  <div class="family-thread">
    <div class="family-thread-label">Your family &nbsp;&middot;&nbsp; Sarah</div>
    <div class="family-thread-text">Sarah is listed in Hebrews 11 — the great hall of faith — alongside Abraham. She is there not in spite of her laughter but as a woman who, in the end, considered Him faithful who had made the promise. Her faith was not unbroken. It was resumed. And it counted. You are in this family now. When your faith has gaps in it, when you laugh at what feels impossible, you are in good company. The family has always made room for the ones who came back.</div>
  </div>

  <div class="worship-block">
    <div class="worship-label">Worship &nbsp;&middot;&nbsp; A song to carry this truth</div>
    <div class="worship-song">"Jireh"</div>
    <div class="worship-artist">Elevation Worship &amp; Maverick City Music</div>
    <a href="https://www.youtube.com/watch?v=mC-zw0zCCtg&list=RDmC-zw0zCCtg&start_radio=1" target="_blank" rel="noopener noreferrer" class="worship-btn">
      &#9654; &nbsp; Listen on YouTube
    </a>
  </div>

  <div class="day-nav">
    <span>Week 1 of 4</span>
    <div class="day-dots">
      <div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot active"></div><div class="dot"></div>
    </div>
    <span>Day 4 of 20</span>
  </div>

  <div class="footer">
    <p>Sparrow LifeChange Program &nbsp;&middot;&nbsp; Corvallis, OR</p>
    <p style="margin-top:10px;">Tomorrow: <em>Jacob — the wrestling match with God that left him limping and blessed</em></p>
  </div>

</div>
</body>
</html>
$d4$, 3
where exists (select 1 from lcp_sessions where session_number = 5)
  and not exists (
    select 1 from lcp_resources
    where kind = 'devotional' and sort_order = 3
      and session_id = (select id from lcp_sessions where session_number = 5)
  );

insert into lcp_resources (session_id, kind, audience, title, content, sort_order)
select (select id from lcp_sessions where session_number = 5), 'devotional', 'participant', 'Basement Day 5 — Jacob', $d5$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sparrow LifeChange Program — Basement Day 5</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: 'Jost', Georgia, sans-serif; padding: 32px 16px 64px; color: #1A1A1A; }
  .email-wrap { max-width: 600px; margin: 0 auto; }
  .header { background: #0A2420; padding: 36px 40px 32px; text-align: center; }
  .logo-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
  .logo-text { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(200,160,32,0.75); }
  .unit-label { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #5A9878; margin-bottom: 10px; }
  .day-label { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(200,160,32,0.6); margin-bottom: 16px; }
  .header-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; font-weight: 300; line-height: 1.2; color: #FFFFFF; margin-bottom: 8px; }
  .header-title em { font-style: italic; color: #E8C84A; }
  .gold-rule { width: 80px; height: 1px; background: linear-gradient(to right, transparent, #C8A020, transparent); margin: 20px auto 0; }
  .scripture-banner { background: #1E5045; padding: 24px 36px; border-left: 3px solid #C8A020; }
  .scripture-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FAF7F0; line-height: 1.6; margin-bottom: 8px; }
  .scripture-ref { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #C8A020; text-align: right; }
  .body-card { background: #FFFFFF; padding: 40px 40px 36px; }
  .greeting { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 400; color: #133028; margin-bottom: 24px; }
  .body-text { font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 300; line-height: 1.9; color: #2A2A2A; margin-bottom: 20px; }
  .body-text strong { font-weight: 500; color: #133028; }
  .body-text em { font-style: italic; }
  .section-head { font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.28em; text-transform: uppercase; color: #C8A020; margin: 36px 0 14px; display: flex; align-items: center; gap: 12px; }
  .section-head::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #C8A020, transparent); opacity: 0.3; }
  .inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; padding: 16px 20px; margin: 24px 0; }
  .inline-scripture p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; color: #133028; line-height: 1.6; margin-bottom: 6px; }
  .inline-scripture span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase; }
  .context-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #2A7A65; margin-bottom: 10px; opacity: 0.7; }
  .scripture-context p { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; font-style: italic; color: #133028; line-height: 1.65; margin-bottom: 10px; }
  .testimony-block { background: #F5F0E8; border-top: 3px solid #8A6E08; padding: 24px 28px; margin: 32px 0; }
  .testimony-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 14px; }
  .testimony-text { font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; line-height: 1.9; color: #2A2A2A; }
  .testimony-text em { font-style: italic; }
  .testimony-text strong { font-weight: 500; color: #133028; }
  .truth-card { background: #FBF5D8; border: 1px solid rgba(200,160,32,0.3); border-left: 4px solid #C8A020; padding: 20px 24px; margin: 28px 0; }
  .truth-card-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #8A6E08; margin-bottom: 10px; }
  .truth-card-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 400; color: #1A1A0A; line-height: 1.55; }
  .prayer-block { background: #0A2420; padding: 32px 40px; }
  .prayer-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: #C8A020; margin-bottom: 16px; }
  .prayer-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.8; margin-bottom: 12px; }
  .prayer-close { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 400; color: #C8A020; text-align: right; letter-spacing: 0.08em; }
  .family-thread { background: #1A3830; border-top: 2px solid rgba(200,160,32,0.25); padding: 26px 36px; }
  .family-thread-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.65); margin-bottom: 14px; }
  .family-thread-text { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-style: italic; font-weight: 300; color: #D8EDE8; line-height: 1.85; }
  .worship-block { background: #1A3830; padding: 24px 40px; text-align: center; border-top: 2px solid rgba(200,160,32,0.3); }
  .worship-label { font-family: 'Jost', sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(200,160,32,0.7); margin-bottom: 12px; }
  .worship-song { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; font-weight: 300; color: #FFFFFF; margin-bottom: 4px; }
  .worship-artist { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); margin-bottom: 16px; letter-spacing: 0.08em; }
  .worship-btn { display: inline-flex; align-items: center; gap: 8px; background: #C8A020; color: #0A2420; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; padding: 10px 22px; text-decoration: none; border-radius: 2px; }
  .worship-btn:hover { background: #E8C84A; }
  .footer { background: #133028; padding: 20px 40px; text-align: center; }
  .footer p { font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 300; color: rgba(216,237,232,0.55); line-height: 1.7; }
  .footer em { font-style: italic; color: rgba(216,237,232,0.75); }
  .day-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background: #0C1E18; }
  .day-nav span { font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(200,160,32,0.4); }
  .day-dots { display: flex; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(200,160,32,0.2); }
  .dot.active { background: #C8A020; }
  details.inline-scripture { background: #EAF2EC; border-left: 3px solid #2A7A65; margin: 24px 0; }
  details.inline-scripture summary { padding: 16px 20px; cursor: pointer; list-style: none; -webkit-appearance: none; }
  details.inline-scripture summary::-webkit-details-marker { display: none; }
  details.inline-scripture summary:hover { background: rgba(42,122,101,0.05); }
  details.inline-scripture summary p { margin-bottom: 6px; }
  .scripture-expand-label { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #2A7A65; }
  .scripture-expand-label .arrow { display: inline-block; transition: transform 0.25s ease; font-size: 11px; }
  details.inline-scripture[open] .arrow { transform: rotate(90deg); }
  details.inline-scripture[open] .toggle-text-closed { display: none; }
  details.inline-scripture:not([open]) .toggle-text-open { display: none; }
  .scripture-context-inner { padding: 0 20px 16px 20px; border-top: 1px solid rgba(42,122,101,0.2); padding-top: 14px; }
</style>
</head>
<body>
<div class="email-wrap">

  <div class="header">
    <div class="logo-row"><span class="logo-text">Sparrow LifeChange Program</span></div>
    <div class="unit-label">The Basement &nbsp;&middot;&nbsp; Week 1</div>
    <div class="day-label">Day 5 of 20</div>
    <div class="header-title">He wrestled with God all night<br>and <em>limped away blessed.</em></div>
    <div class="gold-rule"></div>
  </div>

  <div class="scripture-banner">
    <div class="scripture-text">"Your name will no longer be Jacob, but Israel, because you have struggled with God and with humans and have overcome."</div>
    <div class="scripture-ref">Genesis 32:28</div>
  </div>

  <div class="body-card">
    <div class="greeting">Hello, friend.</div>
    <div class="section-head">A man who spent his whole life grabbing</div>

    <p class="body-text">
      Jacob's name meant <em>heel-grabber.</em> He came into the world clutching his twin brother's heel, trying to pull himself ahead. And that was the pattern of his life — always scheming, always maneuvering, always trying to get through force and cleverness what he couldn't get by waiting. He deceived his father. He stole his brother's blessing. He bargained with God. He was not a gentle man. He was a grinder.
    </p>
    <p class="body-text">
      And God chose him anyway. Not in spite of his nature — but somehow, through it.
    </p>

    <div class="section-head">The story</div>

    <p class="body-text">
      Decades after the deception, Jacob was returning home. His brother Esau was coming toward him with four hundred men — and Jacob was terrified. He had been running from the consequences of what he had taken all his life, and now they were catching up. He sent his family ahead across the river. And alone, in the dark, on the wrong side of the water, a man came and wrestled with him until dawn.
    </p>
    <p class="body-text">
      The text says they wrestled through the night. The man — who was God, or an angel, or something that was both — could not overpower Jacob. So he touched the socket of Jacob's hip and wrenched it. And still Jacob would not let go. He was in pain, his hip was dislocated, the sun was coming up — and he held on.
    </p>

    <details class="inline-scripture">
      <summary>
        <p>"Then the man said, 'Let me go, for it is daybreak.' But Jacob replied, 'I will not let you go unless you bless me.'"</p>
        <span style="font-family: 'Jost', sans-serif; font-size: 10px; letter-spacing: 0.15em; color: #2A7A65; font-weight: 500; text-transform: uppercase;">Genesis 32:26</span>
        <div class="scripture-expand-label"><span class="arrow">&#9656;</span><span class="toggle-text-closed">Read more context</span><span class="toggle-text-open">Close</span></div>
      </summary>
      <div class="scripture-context-inner">
        <div class="context-label">More context &nbsp;&middot;&nbsp; Genesis 32:24–30</div>
        <p>"So Jacob was left alone, and a man wrestled with him till daybreak. When the man saw that he could not overpower him, he touched the socket of Jacob's hip so that his hip was wrenched as he wrestled with the man. Then the man said, 'Let me go, for it is daybreak.' But Jacob replied, 'I will not let you go unless you bless me.' The man asked him, 'What is your name?' 'Jacob,' he answered. Then the man said, 'Your name will no longer be Jacob, but Israel, because you have struggled with God and with humans and have overcome.' Jacob said, 'Please tell me your name.' But he replied, 'Why do you ask my name?' Then he blessed him there. So Jacob called the place Peniel, saying, 'It is because I saw God face to face, and yet my life was spared.'"</p>
      </div>
    </details>

    <p class="body-text">
      He asked for a blessing. After a night of wrestling, in pain, holding on with everything he had, he asked the one thing that had defined his whole life — but this time he was not grabbing or scheming. He was asking. Pleading. Desperate in the most honest way he had ever been.
    </p>
    <p class="body-text">
      And God blessed him. He gave him a new name: <em>Israel.</em> The one who wrestles with God. <strong>The limp was the mark of the encounter — proof that something real had happened, that Jacob had not just dreamed it.</strong> He walked away different. He always would.
    </p>

    <div class="section-head">What this means for you</div>

    <p class="body-text">
      Some women who come through this program have been wrestling with God for years. Angry at Him. Confused by Him. Refusing to let go but also refusing to fully surrender. Holding on in the dark with a pain they can't quite name.
    </p>
    <p class="body-text">
      <strong>The wrestling is not faithlessness. It is engagement.</strong> Jacob could have let go. He didn't. And God honors the ones who hold on even when it hurts, even when the sun is coming up, even when they are limping. The new name does not go to the ones who never struggled. It goes to the ones who wouldn't stop.
    </p>

    <div class="testimony-block">
      <div class="testimony-label">This is still happening &nbsp;&middot;&nbsp; Shelly's story</div>
      <p class="testimony-text">
        A few years ago, my husband's father was in the hospital after a heart surgery that had gone wrong. He was on a ventilator, a feeding tube, full life support. The doctors told us to pull the plug — they could see no brain activity, no path forward. But his family was not ready. They were praying for a miracle, asking God to heal him, holding on in the dark the same way Jacob held on at the river.
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        I was wrestling in my own prayer time — an Immanuel Prayer session — not knowing how to pray for him. It seemed like he would be happier in heaven, but we on earth would be devastated. While I was praying, Jesus brought to mind a memory I had not thought about in years: a funeral I attended when I was six years old. It had been traumatic — the first funeral I had ever been to, and the family was one I knew well. As I sat with that memory, Jesus showed me something I had never seen before. <strong>He had been there. He was there in that room, present with the grieving family, not distant or detached but close and attending to each one. He had called the mother home to heaven for reasons only He knew — that was His sovereignty. And He had walked with everyone who remained, ministering to their wounds, caring for their grief — that was His friendship.</strong>
      </p>
      <p class="testimony-text" style="margin-top: 14px;">
        Sovereign and Friend. Both at once. Seeing that enabled me to trust Him with my father-in-law when I didn't know if he would live or die. I didn't need the outcome explained. I just needed to see that Jesus was in the room — and He was.
      </p>
    </div>

    <div class="truth-card">
      <div class="truth-card-label">One truth to carry today</div>
      <div class="truth-card-text">"Jesus is both Sovereign and Friend. Sovereign — because He knows what He is doing even when we cannot see it. Friend — because He is present with everyone in the room, tending to wounds, not standing at a distance. Jacob wrestled with this same God and walked away marked by the encounter. You can trust the One who is both."</div>
    </div>

    <div class="section-head">Sit with this today</div>
    <p class="body-text">
      Is there a situation you are holding — a person you love, an outcome you cannot control — where you are wrestling with whether to trust God? What would it mean today to let Him be both Sovereign and Friend in it? You don't have to understand everything. You just have to stay in the room with Him.
    </p>
  </div>

  <div class="prayer-block">
    <div class="prayer-label">A prayer for today</div>
    <div class="prayer-text">God, I have been in the dark with You. I have wrestled with things I don't understand and held on when I didn't know if I should. Today I am naming it honestly: I will not let go of You. I don't always understand You. I am sometimes angry. But I am asking — bless me. Give me a new name. Let the limp I carry be the proof that I encountered You and didn't walk away.</div>
    <div class="prayer-close">Amen &nbsp;&middot;&nbsp; Day 5 &nbsp;&middot;&nbsp; The Basement</div>
  </div>

  <div class="family-thread">
    <div class="family-thread-label">Your family &nbsp;&middot;&nbsp; Jacob</div>
    <div class="family-thread-text">Jacob became Israel — and from his twelve sons came the twelve tribes that formed the nation through which Jesus himself would be born. The schemer, the heel-grabber, the man who wrestled God in the dark — he is in your bloodline now. The nation of God's people carries his name. When you feel like you are in a fight you didn't ask for and can't explain, you are not alone in this family. Israel means: one who wrestles with God. You are in good company.</div>
  </div>

  <div class="worship-block">
    <div class="worship-label">Worship &nbsp;&middot;&nbsp; A song to carry this truth</div>
    <div class="worship-song">"Even If"</div>
    <div class="worship-artist">MercyMe</div>
    <a href="https://www.youtube.com/watch?v=B6fA35Ved-Y&list=RDB6fA35Ved-Y&start_radio=1" target="_blank" rel="noopener noreferrer" class="worship-btn">
      &#9654; &nbsp; Listen on YouTube
    </a>
  </div>

  <div class="day-nav">
    <span>Week 1 of 4</span>
    <div class="day-dots">
      <div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot active"></div>
    </div>
    <span>Day 5 of 20</span>
  </div>

  <div class="footer">
    <p>Sparrow LifeChange Program &nbsp;&middot;&nbsp; Corvallis, OR</p>
    <p style="margin-top:10px;">Next week: <em>Joseph — sold by his brothers and redeemed by God</em></p>
  </div>

</div>
</body>
</html>
$d5$, 4
where exists (select 1 from lcp_sessions where session_number = 5)
  and not exists (
    select 1 from lcp_resources
    where kind = 'devotional' and sort_order = 4
      and session_id = (select id from lcp_sessions where session_number = 5)
  );

