import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { H2, Muted } from '@e-infra/design-system'
import { Spinner } from './Spinner'

interface DetailPageLayoutProps {
  title: string
  subtitle?: string
  backTo?: string
  loading?: boolean
  children?: ReactNode
}

/**
 * Shared layout shell for detail pages: back button, title, subtitle,
 * optional loading state, and content area. Replaces the duplicated
 * wrapper markup across ModelDetail / EndpointDetails / SuiteDetails.
 */
export function DetailPageLayout({
  title,
  subtitle,
  backTo = '/',
  loading = false,
  children,
}: DetailPageLayoutProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Link
        to={backTo}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Link>

      <div className="mb-6">
        <H2 className="mb-1">{title}</H2>
        {subtitle && <Muted>{subtitle}</Muted>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}
