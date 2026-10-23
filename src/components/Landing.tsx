import { Compass, Users, Sparkles, ArrowRight } from 'lucide-react';

interface LandingProps {
  onStart: () => void;
}

export function Landing({ onStart }: LandingProps) {
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-900 text-ink-50">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-accent-400 blur-3xl" />
          <div className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full bg-ocean-400 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 py-24 md:py-32">
          <div className="flex items-center gap-2 text-sm text-ink-300">
            <Compass size={18} />
            <span className="font-medium tracking-wide">CommonGround</span>
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-medium leading-tight md:text-6xl">
            Find what your group has in common — even when nobody agrees.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-200">
            CommonGround uses Qloo's cultural intelligence to discover shared
            experiences across music, film, dining, books, and more. Stop
            debating. Start discovering.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button onClick={onStart} className="btn-accent group">
              Create a group
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <a href="#how-it-works" className="btn-secondary border-ink-600 bg-transparent text-ink-100 hover:bg-ink-800 hover:border-ink-500">
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
              usual solutions (endless polling, defaulting to the loudest voice)
              leave everyone mildly unsatisfied.
            </p>
          </div>
          <div className="rounded-xl bg-ink-100 p-8">
            <div className="space-y-4">
              {[
                { name: 'Maya', want: 'Indie films', icon: '🎬' },
                { name: 'James', want: 'Korean BBQ', icon: '🍖' },
                { name: 'Priya', want: 'Jazz bars', icon: '🎷' },
                { name: 'Tom', want: 'Board game cafés', icon: '🎲' },
              ].map((person) => (
                <div key={person.name} className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-lg">
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
                title: '3. Discover shared experiences',
                description: 'Get recommendations that genuinely work for everyone — with a decision trace showing why each suggestion fits.',
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
