/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Action, IAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { Location } from 'vs/editor/common/languages';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { DefinitionAction, SymbolNavigationAction, SymbolNavigationAnchor } from 'vs/editor/contrib/gotoSymbol/goToCommands';
import { ClickLinkMouseEvent } from 'vs/editor/contrib/gotoSymbol/link/clickLinkGesture';
import { RenderedInlayHintLabelPart } from 'vs/editor/contrib/inlayHints/inlayHintsController';
import { PeekContext } from 'vs/editor/contrib/peekView/peekView';
import { isIMenuItem, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export async function showGoToContextMenu(accessor: ServicesAccessor, editor: ICodeEditor, anchor: HTMLElement, part: RenderedInlayHintLabelPart) {

	const resolverService = accessor.get(ITextModelService);
	const contextMenuService = accessor.get(IContextMenuService);
	const instaService = accessor.get(IInstantiationService);

	await part.item.resolve(CancellationToken.None);

	if (!part.part.location) {
		return;
	}

	const location: Location = part.part.location;
	const menuActions: IAction[] = [];

	// from all registered (not active) context menu actions select those
	// that are a symbol navigation action
	const filter = new Set(MenuRegistry.getMenuItems(MenuId.EditorContext)
		.map(item => isIMenuItem(item) ? item.command.id : ''));

	for (const delegate of EditorExtensionsRegistry.getEditorActions()) {
		if (delegate instanceof SymbolNavigationAction && filter.has(delegate.id)) {
			menuActions.push(new Action(delegate.id, delegate.label, undefined, true, async () => {
				const ref = await resolverService.createModelReference(location.uri);
				try {
					await instaService.invokeFunction(delegate.run.bind(delegate), editor, new SymbolNavigationAnchor(ref.object.textEditorModel, Range.getStartPosition(location.range)));
				} finally {
					ref.dispose();

				}
			}));
		}
	}

	// show context menu
	const useShadowDOM = editor.getOption(EditorOption.useShadowDOM);
	contextMenuService.showContextMenu({
		domForShadowRoot: useShadowDOM ? editor.getDomNode() ?? undefined : undefined,
		getAnchor: () => {
			const box = dom.getDomNodePagePosition(anchor);
			return { x: box.left, y: box.top + box.height + 8 };
		},
		getActions: () => menuActions,
		onHide: () => {
			editor.focus();
		},
		autoSelectFirstItem: true,
	});

}

export async function goToDefinitionWithLocation(accessor: ServicesAccessor, event: ClickLinkMouseEvent, editor: IActiveCodeEditor, location: Location) {

	const resolverService = accessor.get(ITextModelService);
	const ref = await resolverService.createModelReference(location.uri);

	await editor.invokeWithinContext(async (accessor) => {

		const openToSide = event.hasSideBySideModifier;
		const contextKeyService = accessor.get(IContextKeyService);

		const isInPeek = PeekContext.inPeekEditor.getValue(contextKeyService);
		const canPeek = !openToSide && editor.getOption(EditorOption.definitionLinkOpensInPeek) && !isInPeek;

		const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: true }, { alias: '', label: '', id: '', precondition: undefined });
		return action.run(accessor, editor, { model: ref.object.textEditorModel, position: Range.getStartPosition(location.range) });
	});

	ref.dispose();
}
