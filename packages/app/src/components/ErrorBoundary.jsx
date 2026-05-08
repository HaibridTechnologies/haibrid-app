import { Component } from 'react'

/**
 * Top-level error boundary.
 * Catches render errors anywhere in the tree and shows a friendly
 * fallback rather than a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2 className="error-boundary-title">Something went wrong</h2>
          <p className="error-boundary-message">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button className="primary" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
