import { Button } from '@e-infra/design-system'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  /** Number of results shown per page */
  numberOfResultsPerPage: number
  /** Current page number (1-indexed) */
  currentPageProp?: number
  /** Callback when page changes */
  onPageChange: (page: number) => void
}

/**
 * Pagination component with Previous/Next navigation.
 */
export function Pagination({
  numberOfResultsPerPage,
  currentPageProp = 1,
  onPageChange,
}: PaginationProps) {
  const maxPages = getMaxPages(numberOfResultsPerPage)

  const handlePreviousPage = () => {
    const newPage = currentPageProp + 1
    onPageChange(newPage)
  }

  const handleNextPage = () => {
    const newPage = currentPageProp - 1
    onPageChange(newPage)
  }

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPageProp >= maxPages}
        onClick={handlePreviousPage}
        className="flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>

      <span className="text-sm text-muted-foreground">
        Page {currentPageProp} of {maxPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={currentPageProp <= 1}
        onClick={handleNextPage}
        className="flex items-center gap-1"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Calculate maximum number of pages based on config or default.
 */
function getMaxPages(numberOfResultsPerPage: number): number {
  let maxResults = 100 // Default value

  if (typeof window !== 'undefined' && (window as any).config?.maximumNumberOfResults) {
    const parsed = parseInt((window as any).config.maximumNumberOfResults, 10)
    if (!isNaN(parsed)) {
      maxResults = parsed
    }
  }

  return Math.ceil(maxResults / numberOfResultsPerPage)
}
