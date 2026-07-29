import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/datasets/')({
  beforeLoad: () => {
    throw redirect({ to: '/experiments' })
  },
})
