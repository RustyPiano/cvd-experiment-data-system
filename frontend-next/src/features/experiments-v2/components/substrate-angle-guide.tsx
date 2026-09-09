import { useTranslation } from 'react-i18next'

export function SubstrateAngleGuide() {
  const { t } = useTranslation()
  return (
    <details open className="rounded-lg border bg-muted/30 p-3 sm:col-span-3">
      <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        {t('substrateAngleGuide.title')}
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <figure className="min-w-0 rounded-md border bg-background p-3">
          <figcaption className="text-sm font-medium">
            {t('substrateAngleGuide.sideTitle')}
          </figcaption>
          <svg
            viewBox="0 0 360 240"
            role="img"
            aria-label={t('substrateAngleGuide.sideAlt')}
            className="mx-auto w-full max-w-sm text-foreground"
            fill="none"
          >
            <g
              stroke="var(--muted-foreground)"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            >
              <path d="M 26 132 H 334" strokeDasharray="none" strokeWidth="2" />
              <path d="M 192 49 V 132" />
            </g>
            <g transform="rotate(30 144 132)">
              <rect
                x="58"
                y="132"
                width="172"
                height="8"
                rx="2"
                fill="var(--muted-foreground)"
              />
              <path
                d="M 58 132 H 230"
                stroke="var(--primary)"
                strokeWidth="4"
              />
            </g>
            <g stroke="var(--primary)" strokeWidth="2.5">
              <path d="M 144 132 L 192 49 M 182 55 L 192 49 L 192 61" />
              <path d="M 144 132 H 192" strokeDasharray="4 3" />
              <path d="M 185 128 L 192 132 L 185 136" />
              <path d="M 206 132 A 62 62 0 0 1 197.7 163" />
              <path d="M 178 73.2 A 28 28 0 0 0 192 77" />
            </g>
            <g stroke="var(--muted-foreground)">
              <path d="M 86 70 L 96 100" />
              <path d="M 93 175 L 109 120" />
              <path d="M 215 113 L 192 132" />
            </g>
            <g fill="currentColor" fontSize="16">
              <text x="190" y="150" fontSize="14" fill="var(--primary)">
                α
              </text>
              <text x="177" y="100" fontSize="14" fill="var(--primary)">
                α
              </text>
              <text x="56" y="60" fill="var(--primary)">
                {t('substrateAngleGuide.growthFace')}
              </text>
              <text x="65" y="195">
                {t('substrateAngleGuide.substrate')}
              </text>
              <text x="334" y="155" textAnchor="end">
                {t('substrateAngleGuide.horizontal')}
              </text>
              <text x="334" y="22" textAnchor="end" fill="var(--primary)">
                α = +30°
              </text>
              <text x="209" y="55">
                {t('substrateAngleGuide.normal')}
              </text>
              <text x="209" y="75" fill="var(--muted-foreground)">
                {t('substrateAngleGuide.normalTerm')}
              </text>
              <text x="219" y="111" fill="var(--primary)">
                {t('substrateAngleGuide.projection')}
              </text>
            </g>
          </svg>
        </figure>
        <figure className="min-w-0 rounded-md border bg-background p-3">
          <figcaption className="text-sm font-medium">
            {t('substrateAngleGuide.topTitle')}
          </figcaption>
          <svg
            viewBox="0 0 360 240"
            role="img"
            aria-label={t('substrateAngleGuide.topAlt')}
            className="mx-auto w-full max-w-sm text-foreground"
            fill="none"
          >
            <g stroke="var(--muted-foreground)">
              <circle cx="180" cy="130" r="76" />
              <path d="M 180 54 V 130 M 104 130 H 256" strokeDasharray="5 5" />
            </g>
            <path
              d="M 180 130 V 85 A 45 45 0 0 1 219 107.5 Z"
              fill="var(--primary)"
              fillOpacity="0.1"
            />
            <g stroke="var(--primary)" strokeWidth="2.5">
              <path d="M 180 130 L 246 92 M 234 93 L 246 92 L 241 103" />
              <path d="M 180 85 A 45 45 0 0 1 219 107.5 M 211 104 L 219 107.5 L 220 99" />
            </g>
            <circle cx="180" cy="130" r="4" fill="var(--primary)" />
            <g fill="currentColor" fontSize="16" textAnchor="middle">
              <text x="195" y="113" fontSize="14" fill="var(--primary)">
                φ
              </text>
              <text x="180" y="30">
                {t('substrateAngleGuide.downstream')}
              </text>
              <text x="303" y="135">
                90°
              </text>
              <text x="180" y="231">
                {t('substrateAngleGuide.upstream')}
              </text>
              <text x="52" y="135">
                270°
              </text>
              <text x="334" y="22" textAnchor="end" fill="var(--primary)">
                φ = 60°
              </text>
              <text x="180" y="167" fill="var(--primary)">
                {t('substrateAngleGuide.projectionLine1')}
              </text>
              <text x="180" y="187" fill="var(--primary)">
                {t('substrateAngleGuide.projectionLine2')}
              </text>
            </g>
          </svg>
        </figure>
      </div>
    </details>
  )
}
