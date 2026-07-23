import { useState, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@e-infra/design-system'

interface SearchBarProps {
  onSearch?: (query: string) => void
  onFilterChange?: (filter: FilterOption) => void
  onSortChange?: (sort: SortOption) => void
  onGroupByGroup?: (groupByGroup: boolean) => void
  onInitializeCollapsedGroups?: () => void
  defaultFilterBy?: FilterOption
  defaultSortBy?: SortOption
}

type FilterOption = 'none' | 'failing' | 'unstable'
type SortOption = 'name' | 'group' | 'health'

const FILTER_OPTIONS = [
  { label: 'None', value: 'none' as FilterOption },
  { label: 'Failing', value: 'failing' as FilterOption },
  { label: 'Unstable', value: 'unstable' as FilterOption }
]

const SORT_OPTIONS = [
  { label: 'Name', value: 'name' as SortOption },
  { label: 'Group', value: 'group' as SortOption },
  { label: 'Health', value: 'health' as SortOption }
]

/**
 * Custom hook for debouncing a value
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds
 * @returns The debounced value
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Get initial filter value from localStorage or default
 */
function getInitialFilter(defaultFilter: FilterOption): FilterOption {
  if (typeof window === 'undefined') return defaultFilter
  const stored = localStorage.getItem('gatus:filter-by')
  return (stored as FilterOption) || defaultFilter
}

/**
 * Get initial sort value from localStorage or default
 */
function getInitialSort(defaultSort: SortOption): SortOption {
  if (typeof window === 'undefined') return defaultSort
  const stored = localStorage.getItem('gatus:sort-by')
  return (stored as SortOption) || defaultSort
}

export function SearchBar({
  onSearch,
  onFilterChange,
  onSortChange,
  onGroupByGroup,
  onInitializeCollapsedGroups,
  defaultFilterBy = 'none',
  defaultSortBy = 'name'
}: SearchBarProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBy, setFilterBy] = useState<FilterOption>(() => getInitialFilter(defaultFilterBy))
  const [sortBy, setSortBy] = useState<SortOption>(() => getInitialSort(defaultSortBy))

  // Debounced search query (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Emit search event when debounced value changes
  useEffect(() => {
    onSearch?.(debouncedSearchQuery)
  }, [debouncedSearchQuery, onSearch])

  // Handle filter change
  const handleFilterChange = useCallback((value: FilterOption, store = true) => {
    setFilterBy(value)
    
    if (store) {
      localStorage.setItem('gatus:filter-by', value)
    }
    
    // Reset all filter states first
    onFilterChange?.('none')
    
    // Apply the selected filter
    if (value === 'failing') {
      onFilterChange?.('failing')
    } else if (value === 'unstable') {
      onFilterChange?.('unstable')
    }
  }, [onFilterChange])

  // Handle sort change
  const handleSortChange = useCallback((value: SortOption, store = true) => {
    setSortBy(value)
    
    if (store) {
      localStorage.setItem('gatus:sort-by', value)
    }

    onSortChange?.(value)
    onGroupByGroup?.(value === 'group')
    
    // When switching to group view, initialize collapsed groups
    if (value === 'group') {
      onInitializeCollapsedGroups?.()
    }
  }, [onSortChange, onGroupByGroup, onInitializeCollapsedGroups])

  // Clear search query
  const handleClear = useCallback(() => {
    setSearchQuery('')
    onSearch?.('')
  }, [onSearch])

  // Keyboard shortcut: Escape to clear search
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleClear()
    }
  }, [handleClear])

  // Initialize filter/sort on mount (apply saved state but don't store again)
  useEffect(() => {
    handleFilterChange(filterBy, false)
    handleSortChange(sortBy, false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 p-3 sm:p-4 bg-card rounded-lg border">
      {/* Search Input */}
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <label htmlFor="search-input" className="sr-only">
            Search endpoints
          </label>
          <Input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search endpoints..."
            className="pl-10 text-sm sm:text-base pr-10"
          />
          {/* Clear button */}
          {searchQuery && (
            <button
              type="button"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClear()
                }
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
              tabIndex={0}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        {/* Filter Dropdown */}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
          <label 
            htmlFor="filter-select"
            className="text-xs sm:text-sm font-medium text-muted-foreground whitespace-nowrap"
          >
            Filter by:
          </label>
          <select
            value={filterBy}
            onChange={(e) => handleFilterChange(e.target.value as FilterOption)}
            className="flex-1 sm:w-[140px] md:w-[160px] border rounded-md px-2 py-1 text-sm bg-background"
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        
        {/* Sort Dropdown */}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
          <label 
            htmlFor="sort-select"
            className="text-xs sm:text-sm font-medium text-muted-foreground whitespace-nowrap"
          >
            Sort by:
          </label>
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as SortOption)}
            className="flex-1 sm:w-[90px] md:w-[100px] border rounded-md px-2 py-1 text-sm bg-background"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
