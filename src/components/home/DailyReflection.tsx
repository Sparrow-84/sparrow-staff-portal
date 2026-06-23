type Reflection =
  | { kind: 'verse'; text: string; reference: string }
  | { kind: 'phrase'; text: string };

const REFLECTIONS: Reflection[] = [
  { kind: 'verse', text: 'Even the sparrow finds a home.', reference: 'Psalm 84:3' },
  { kind: 'phrase', text: 'We hold hope for people until they can begin to carry it themselves.' },
  {
    kind: 'verse',
    text: 'God places the lonely in families; He sets the prisoners free and gives them joy.',
    reference: 'Psalm 68:6',
  },
  { kind: 'phrase', text: 'We are stewards, not owners.' },
  { kind: 'verse', text: 'You are of more value than many sparrows.', reference: 'Matthew 10:31' },
  {
    kind: 'phrase',
    text: 'Every person is made in the image of God — beloved, purposeful, and of infinite worth.',
  },
  {
    kind: 'verse',
    text: 'So also faith by itself, if it does not have works, is dead.',
    reference: 'James 2:17',
  },
  { kind: 'phrase', text: 'Our programs are designed to awaken life, not just stabilize crisis.' },
  { kind: 'verse', text: 'So God created mankind in his own image.', reference: 'Genesis 1:27' },
  { kind: 'phrase', text: 'Lasting transformation is whole-person and rarely fast or linear.' },
  {
    kind: 'verse',
    text: "Greater love has no one than this: to lay down one's life for one's friends.",
    reference: 'John 15:13',
  },
  { kind: 'phrase', text: "We don't arrive as the people who have it figured out." },
  {
    kind: 'verse',
    text: 'Even the sparrow finds a home, and the swallow a nest for herself, where she may lay her young, at your altars, O LORD of hosts, my King and my God.',
    reference: 'Psalm 84:3',
  },
  {
    kind: 'phrase',
    text: 'We invite people into the choice of transformation — real change must be chosen, not forced.',
  },
  {
    kind: 'verse',
    text: 'Everyone to whom much is given, of him much will be required.',
    reference: 'Luke 12:48',
  },
  {
    kind: 'phrase',
    text: 'Homelessness is rarely just a housing problem — it is often the unraveling of healthy family and community.',
  },
  {
    kind: 'verse',
    text: 'Like a tree planted by water — it does not fear when heat comes, for its leaves remain green.',
    reference: 'Jeremiah 17:7–8',
  },
  { kind: 'phrase', text: 'People often grow into the identity they are given.' },
  {
    kind: 'verse',
    text: 'Are not two sparrows sold for a penny? And not one of them will fall to the ground apart from your Father. Fear not — you are of more value than many sparrows.',
    reference: 'Matthew 10:29–31',
  },
  { kind: 'phrase', text: 'We stay curious, ask before we assume, and hold our expertise loosely.' },
  {
    kind: 'verse',
    text: 'So God created mankind in his own image, in the image of God he created them; male and female he created them.',
    reference: 'Genesis 1:27',
  },
  { kind: 'phrase', text: 'We pray over what we build — not merely good ideas, but God ideas.' },
  {
    kind: 'phrase',
    text: 'Partnerships are built on shared mission, mutual respect, integrity, and long-term trust.',
  },
];

function getWorkdayIndex(today: string): number {
  const date = new Date(today + 'T00:00:00');
  const dow = date.getDay();
  const adjusted = new Date(date);
  // Saturday and Sunday show the same entry as the preceding Friday
  if (dow === 0) adjusted.setDate(date.getDate() - 2);
  if (dow === 6) adjusted.setDate(date.getDate() - 1);
  const yearStart = new Date(adjusted.getFullYear(), 0, 1);
  return Math.floor((adjusted.getTime() - yearStart.getTime()) / 86400000);
}

export function DailyReflection({ today }: { today: string }) {
  const item = REFLECTIONS[getWorkdayIndex(today) % REFLECTIONS.length];
  return (
    <div className="mt-5 border-l-2 border-sparrow-gold pl-4">
      <p className="text-sm italic text-sparrow-ink">{item.text}</p>
      {item.kind === 'verse' && (
        <p className="mt-0.5 text-xs text-sparrow-gray">— {item.reference}</p>
      )}
    </div>
  );
}
