export const metadata = {
  title: 'Natinael Ejeta — Full-Stack Developer | Next.js, TypeScript, PostgreSQL',
  description:
    'Natinael Ejeta — Full-Stack Developer based in Addis Ababa, Ethiopia. Designer, builder and deployer of complete web applications. Open to junior, freelance and remote roles.',
  keywords: [
    'Natinael Ejeta',
    'Full-Stack Developer',
    'Next.js',
    'TypeScript',
    'PostgreSQL',
    'Addis Ababa',
    'Ethiopia',
    'Prisma',
    'React',
    'Portfolio',
  ],
  authors: [{ name: 'Natinael Ejeta' }],
  openGraph: {
    title: 'Natinael Ejeta — Full-Stack Developer',
    description:
      'Designer, builder and deployer of complete web applications. Open to junior, freelance and remote roles.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Natinael Ejeta — Full-Stack Developer',
    description:
      'Designer, builder and deployer of complete web applications.',
  },
}

export default function Page() {
  return (
    <iframe
      src="/portfolio.html"
      title="Natinael Ejeta — Portfolio"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'block',
      }}
      allow="autoplay; clipboard-write"
    />
  )
}
