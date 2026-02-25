export const slotGames = [
  {
    slug: 'mole-digger-slots',
    title: 'Mole Digger Slots',
    provider: "Play'n GO",
    category: 'Adventure Slots',
    volatility: 'Medium',
    mode: 'Demo',
    launchUrl:
      'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=moledigger&lang=en_GB&practice=1&channel=desktop&demo=2',
    faq: [
      {
        q: 'Can I play this game in demo mode?',
        a: 'Yes. This launch is configured for practice mode so you can test gameplay without real-money risk.'
      },
      {
        q: 'Does this game use my Rapid Rolls wallet?',
        a: 'External provider slots run in an iframe. Wallet-connected wagering is only available on in-platform originals.'
      },
      {
        q: 'Why open in a new tab?',
        a: 'If your browser blocks embedded content, opening in a new tab gives the cleanest provider session.'
      }
    ]
  },
  {
    slug: 'rise-of-olympus-1000',
    title: 'Rise of Olympus 1000',
    provider: "Play'n GO",
    category: 'Mythology Slots',
    volatility: 'High',
    mode: 'Demo',
    launchUrl:
      'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=riseofolympus1000&lang=en_GB&practice=1&channel=desktop&demo=2',
    faq: [
      {
        q: 'Is this available on desktop?',
        a: 'Yes. This launcher is configured for desktop mode with practice gameplay enabled.'
      },
      {
        q: 'Can I switch to full-screen?',
        a: 'Use the full-screen option from the provider game controls for the best experience.'
      },
      {
        q: 'Does game speed impact outcomes?',
        a: 'No. Spin speed changes only presentation, not randomness or outcome distribution.'
      }
    ]
  },
  {
    slug: 'fangs-and-fire',
    title: 'Fangs and Fire',
    provider: "Play'n GO",
    category: 'Fantasy Slots',
    volatility: 'High',
    mode: 'Demo',
    launchUrl:
      'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=fangsandfire&lang=en_GB&practice=1&channel=mobile&demo=2',
    faq: [
      {
        q: 'Why is this using mobile channel?',
        a: 'This launch URL is configured for mobile channel rendering for flexible responsive play.'
      },
      {
        q: 'Can I still use it on desktop?',
        a: 'Yes. It will render in a mobile-optimized layout within the slot frame.'
      },
      {
        q: 'Are spin outcomes provably fair here?',
        a: 'Provider slots use the provider RNG system and certification, separate from internal game fairness panels.'
      }
    ]
  },
  {
    slug: 'lawnnd-isorder',
    title: 'Lawnnd Isorder',
    provider: "Play'n GO",
    category: 'Comedy Slots',
    volatility: 'Medium',
    mode: 'Demo',
    launchUrl:
      'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=lawnnd.isorder&lang=en_GB&practice=1&channel=mobile&demo=2',
    faq: [
      {
        q: 'The game ID looks unusual, is that expected?',
        a: 'Yes. This page uses the exact provider URL you requested, including the provided game ID.'
      },
      {
        q: 'What if the game fails to load?',
        a: 'Try “Open in New Tab”. If provider access is blocked in-region, the launcher may not initialize.'
      },
      {
        q: 'Can this be switched to desktop channel?',
        a: 'Yes, we can add a desktop URL variant if you want a dedicated desktop launch preset.'
      }
    ]
  },
  {
    slug: 'hotdog-heist',
    title: 'Hotdog Heist',
    provider: "Play'n GO",
    category: 'Themed Slots',
    volatility: 'Medium',
    mode: 'Demo',
    launchUrl:
      'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=hotdogheist&lang=en_GB&practice=1&channel=mobile&demo=2',
    faq: [
      {
        q: 'Is this a real provider feed?',
        a: 'Yes. This loads directly from the Play\'n GO launcher endpoint in practice mode.'
      },
      {
        q: 'Does this page track bonus buy status?',
        a: 'No. Bonus and feature states are handled inside the embedded provider client.'
      },
      {
        q: 'Can we add quick-launch favorite shortcuts?',
        a: 'Yes. We can pin this slot in the Home lobby shortcuts in a follow-up patch.'
      }
    ]
  },
  {
    slug: 'bonanza-down-under',
    title: 'Bonanza Down Under',
    provider: "Play'n GO",
    category: 'Adventure Slots',
    volatility: 'Medium',
    mode: 'Demo',
    launchUrl:
      'https://asccw.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=bonanzadownunder&lang=en_GB&practice=1&channel=mobile&demo=2',
    faq: [
      {
        q: 'This uses a different Play\'n GO host. Is that okay?',
        a: 'Yes. This title launches from the exact host and URL provided for this game.'
      },
      {
        q: 'Can this be moved to the main released host?',
        a: 'If you have an alternate release URL, we can swap it without changing the page layout.'
      },
      {
        q: 'How do I report load or frame issues?',
        a: 'Use the site notifications or admin tools so staff can verify provider availability quickly.'
      }
    ]
  }
];

export const slotGameBySlug = Object.fromEntries(slotGames.map((slot) => [slot.slug, slot]));

export const isSlotSlug = (slug) => Boolean(slotGameBySlug[String(slug || '')]);
