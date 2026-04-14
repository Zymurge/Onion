import { createElement } from 'react'

type ReactJsonPrintProps = {
	dataObject: unknown
	depth?: number
}

export default function ReactJsonPrint({ dataObject, depth }: ReactJsonPrintProps) {
	return createElement(
		'pre',
		{ className: 'react-json-print-mock', 'data-testid': 'react-json-print-mock', 'data-depth': String(depth ?? 0) },
		JSON.stringify(dataObject, null, 2),
	)
}