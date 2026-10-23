import { Compass, Users, Sparkles, ArrowRight, Layers, Search, Film, MapPin, Music, Gamepad2 } from 'lucide-react';

interface LandingProps {
  onStart: () => void;
}

const HERO_IMG = 'https://images.pexels.com/photos/9124759/pexels-photo-9124759.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
const CONCERT_IMG = 'https://images.pexels.com/photos/13230484/pexels-photo-13230484.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
const GALLERY_IMG = 'https://images.pexels.com/photos/29608796/pexels-photo-29608796.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

export function Landing({ onStart }: LandingProps) {
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-900 text-ink-50">
        <div className="absolute inset-0">
          <img
            src={HERO_IMG}
            alt="Friends enjoying a night out together"
            className="h-full w-full object-cover opacity-30"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/80 to-ink-900/40" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 py-24 md:py-36">
          <div className="flex items-center gap-2 text-sm text-ink-300">
            <Compass size={18} className="text-accent-400" />
            <span className="font-medium tracking-wide">CommonGround</span>
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-medium leading-tight md:text-6xl">
            Different tastes.<br />One group plan.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-200">
            CommonGround uses Qloo's cultural intelligence to discover experiences
            your whole group will enjoy — across music, film, dining, books, and more.
            Stop debating. Start discovering.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button onClick={onStart} className="btn-accent group">
              Create a group
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink-600 bg-transparent px-6 py-3 text-sm font-medium text-ink-100 transition-all hover:bg-ink-800 hover:border-ink-500"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-medium text-ink-900">The group decision problem</h2>
            <p className="mt-4 text-ink-600 leading-relaxed">
              You want to plan a night out, pick a movie, or find a restaurant.
              One person loves jazz, another prefers pop. Someone wants Italian,
              someone else wants Thai. Every group has this problem — and the
              usual solutions leave everyone mildly unsatisfied.
            </p>
          </div>
          <div className="rounded-2xl bg-ink-100 p-8">
            <div className="space-y-3">
              {[
                { name: 'Maya', want: 'Indie films', icon: <Film size={16} /> },
                { name: 'James', want: 'Korean BBQ', icon: <MapPin size={16} /> },
                { name: 'Priya', want: 'Jazz bars', icon: <Music size={16} /> },
                { name: 'Tom', want: 'Board game cafes', icon: <Gamepad2 size={16} /> },
              ].map((person) => (
                <div key={person.name} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                    {person.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{person.name}</p>
                    <p className="text-xs text-ink-500">{person.want}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section id="how-it-works" className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-medium text-ink-900">
            How CommonGround works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-ink-600">
            Qloo's cultural intelligence maps connections across hundreds of
            millions of entities — not generic recommendations, but real
            taste-based affinities.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: <Users className="text-accent-600" size={28} />,
                title: '1. Build your group',
                description: 'Add members and their cultural interests — music, movies, food, books, and more. Each person lists what they love.',
              },
              {
                icon: <Sparkles className="text-accent-600" size={28} />,
                title: '2. Qloo finds connections',
                description: "Qloo's API analyzes cross-domain affinities: if Maya loves indie films and James loves Korean BBQ, Qloo finds the overlap.",
              },
              {
                icon: <Compass className="text-accent-600" size={28} />,
                title: '3. Discover together',
                description: 'Get ranked recommendations with consensus scores, member coverage, and a full decision trace showing why each suggestion fits.',
              },
            ].map((step) => (
              <div key={step.title} className="card">
                <div className="mb-4">{step.icon}</div>
                <h3 className="text-lg font-medium text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature showcase */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
            <img src={CONCERT_IMG} alt="Live concert with vibrant stage lighting" className="h-56 w-full object-cover" loading="lazy" />
            <div className="p-6">
              <div className="flex items-center gap-2 text-accent-600">
                <Search size={18} />
                <span className="text-sm font-medium">Real taste matching</span>
              </div>
              <h3 className="mt-2 text-lg font-medium text-ink-900">Powered by Qloo Insights</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Every recommendation comes from Qloo's cultural intelligence API,
                scoped to your destination. No fabricated results — just real
                places surfaced by cross-domain taste affinities.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
            <img src={GALLERY_IMG} alt="Art gallery exhibition space" className="h-56 w-full object-cover" loading="lazy" />
            <div className="p-6">
              <div className="flex items-center gap-2 text-ocean-600">
                <Layers size={18} />
                <span className="text-sm font-medium">Transparent consensus</span>
              </div>
              <h3 className="mt-2 text-lg font-medium text-ink-900">See why it fits</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Every candidate shows its consensus score, member coverage, and
                a full decision trace. You always know which members surfaced
                each recommendation and how it was ranked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="text-3xl font-medium text-ink-900">
          Ready to find common ground?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-600">
          Create a group, add interests, and let Qloo's cultural intelligence
          find experiences everyone will enjoy.
        </p>
        <button onClick={onStart} className="btn-primary mt-8 group">
          Get started
          <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </button>
      </section>
    </div>
  );
}
