type Snippet =
  | { kind: 'verse'; text: string; reference: string }
  | { kind: 'phrase'; text: string };

// Rotates daily so it doesn't go stale.
// Matthew 10:31 (index 10) and Matthew 10:29–31 (index 26) are intentionally separated.
const SNIPPETS: Snippet[] = [
  { kind: 'verse', text: 'We love because he first loved us.', reference: '1 John 4:19' },
  {
    kind: 'verse',
    text: 'Speak up for those who cannot speak for themselves; ensure justice for those being crushed. Speak up for the poor and helpless, and see that they get justice.',
    reference: 'Proverbs 31:8–9',
  },
  { kind: 'phrase', text: 'Because He served, we serve.' },
  {
    kind: 'verse',
    text: 'May the God of hope fill you with all joy and peace as you trust in him, so that you may overflow with hope by the power of the Holy Spirit.',
    reference: 'Romans 15:13',
  },
  {
    kind: 'verse',
    text: 'God places the lonely in families; He sets the prisoners free and gives them joy.',
    reference: 'Psalm 68:6',
  },
  { kind: 'phrase', text: 'We hold hope for people until they can begin to carry it themselves.' },
  {
    kind: 'verse',
    text: 'It is required of stewards that they be found faithful.',
    reference: '1 Corinthians 4:2',
  },
  {
    kind: 'verse',
    text: 'For I know the plans I have for you, declares the Lord — plans for welfare and not for evil, to give you a future and a hope.',
    reference: 'Jeremiah 29:11',
  },
  {
    kind: 'verse',
    text: 'Unless the Lord builds the house, the builders labor in vain.',
    reference: 'Psalm 127:1',
  },
  { kind: 'phrase', text: 'We are stewards, not owners.' },
  { kind: 'verse', text: 'You are of more value than many sparrows.', reference: 'Matthew 10:31' },
  {
    kind: 'verse',
    text: 'See what great love the Father has lavished on us, that we should be called children of God — and that is what we are.',
    reference: '1 John 3:1',
  },
  { kind: 'phrase', text: 'We exist for the people the world tends to overlook.' },
  {
    kind: 'verse',
    text: 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind.',
    reference: 'Romans 12:2',
  },
  {
    kind: 'verse',
    text: 'He who began a good work in you will carry it on to completion.',
    reference: 'Philippians 1:6',
  },
  { kind: 'phrase', text: 'Our hope is not rooted in circumstances — it is rooted in God.' },
  {
    kind: 'verse',
    text: 'Whatever you did for one of the least of these… you did for me.',
    reference: 'Matthew 25:40',
  },
  { kind: 'verse', text: 'I have come that they may have life, and have it to the full.', reference: 'John 10:10' },
  { kind: 'phrase', text: 'Lasting transformation is whole-person and rarely fast or linear.' },
  {
    kind: 'verse',
    text: 'So also faith by itself, if it does not have works, is dead.',
    reference: 'James 2:17',
  },
  {
    kind: 'verse',
    text: 'Carry each other\'s burdens, and in this way you will fulfill the law of Christ.',
    reference: 'Galatians 6:2',
  },
  { kind: 'phrase', text: 'Our boundaries are part of how we love well.' },
  {
    kind: 'verse',
    text: "Greater love has no one than this: to lay down one's life for one's friends.",
    reference: 'John 15:13',
  },
  {
    kind: 'verse',
    text: 'Everyone to whom much is given, of him much will be required.',
    reference: 'Luke 12:48',
  },
  {
    kind: 'phrase',
    text: 'Community is not an accessory to our work — it is one of the main ways healing happens.',
  },
  {
    kind: 'verse',
    text: 'Like a tree planted by water — it does not fear when heat comes, for its leaves remain green.',
    reference: 'Jeremiah 17:7–8',
  },
  {
    kind: 'verse',
    text: 'Are not two sparrows sold for a penny? And not one of them will fall to the ground apart from your Father. Fear not — you are of more value than many sparrows.',
    reference: 'Matthew 10:29–31',
  },
  { kind: 'phrase', text: 'People often grow into the identity they are given.' },
  { kind: 'verse', text: 'In humility value others above yourselves.', reference: 'Philippians 2:3' },
  {
    kind: 'verse',
    text: 'Commit to the Lord whatever you do, and he will establish your plans.',
    reference: 'Proverbs 16:3',
  },
  { kind: 'phrase', text: 'We pray over what we build — not merely good ideas, but God ideas.' },
  {
    kind: 'verse',
    text: 'Seek first his kingdom and his righteousness, and all these things will be given to you as well.',
    reference: 'Matthew 6:33',
  },
  {
    kind: 'verse',
    text: 'My God will supply every need of yours according to his riches in glory in Christ Jesus.',
    reference: 'Philippians 4:19',
  },
  {
    kind: 'phrase',
    text: "Caring for the vulnerable in our community is not an optional expression of compassion — it's our mandate.",
  },
  {
    kind: 'verse',
    text: 'The purposes of a person\'s heart are deep waters, but one who has insight draws them out.',
    reference: 'Proverbs 20:5',
  },
  {
    kind: 'verse',
    text: 'Whoever can be trusted with very little can also be trusted with much.',
    reference: 'Luke 16:10',
  },
  {
    kind: 'phrase',
    text: 'Our programs are designed to awaken life, not just stabilize crisis.',
  },
  {
    kind: 'verse',
    text: 'Two are better than one, because they have a good return for their labor.',
    reference: 'Ecclesiastes 4:9',
  },
  {
    kind: 'verse',
    text: 'The water I give them will become in them a spring of water welling up to eternal life.',
    reference: 'John 4:14',
  },
  {
    kind: 'phrase',
    text: 'To strengthen families into health, build transformational communities, and demonstrate the value God has for people by fostering environments where individuals thrive.',
  },
  {
    kind: 'verse',
    text: 'Even the sparrow finds a home, and the swallow a nest for herself, where she may lay her young, at your altars, O LORD of hosts, my King and my God.',
    reference: 'Psalm 84:3',
  },
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export function ValuesFooter() {
  const snippet = SNIPPETS[dayOfYear(new Date()) % SNIPPETS.length];

  return (
    <footer className="border-t border-sparrow-rule bg-white px-4 py-2 text-center">
      <p className="text-xs italic text-sparrow-gray">{snippet.text}</p>
      {snippet.kind === 'verse' && (
        <p className="text-xs text-sparrow-gray">— {snippet.reference}</p>
      )}
    </footer>
  );
}
