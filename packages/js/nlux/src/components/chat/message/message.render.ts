import {IObserver} from '../../../core/bus/observer';
import {NluxRenderingError} from '../../../core/error';
import {CompRenderer} from '../../../types/comp';
import {listenToElement} from '../../../utils/dom/listenToElement';
import {createMdStreamRenderer} from '../../../utils/md/streamParser';
import {textToHtml} from '../../../x/parseTextMessage';
import {render} from '../../../x/render';
import {source} from '../../../x/source';
import {
    CompMessageActions,
    CompMessageElements,
    CompMessageEvents,
    CompMessageProps,
    MessageContentLoadingStatus,
} from './message.types';

export const __ = (styleName: string) => `nluxc-text-message-${styleName}`;

const html = ({content, createdAt}: CompMessageProps) => `` +
    `<div class="${__('content')}" tabindex="0">${content ? textToHtml(content) : ''}</div>` +
    ``;

export const renderMessage: CompRenderer<
    CompMessageProps, CompMessageElements, CompMessageEvents, CompMessageActions
> = ({appendToRoot, props, compEvent}) => {
    if (props.format !== 'text') {
        throw new NluxRenderingError({
            source: source('message', 'render'),
            message: `Unsupported format: ${props.format}! Only text is currently supported!`,
        });
    }

    const dom = render(html(props));
    if (!dom) {
        throw new NluxRenderingError({
            source: source('prompt-box', 'render'),
            message: 'Message could not be rendered',
        });
    }

    const container = document.createElement('div');
    const classFromDirection = props.direction === 'in' ? 'received' : 'sent';
    let classFromLoadingStatus = `loading-status-${props.loadingStatus}`;
    container.append(dom);
    container.classList.add(__('container'));
    container.classList.add(__(classFromDirection));
    container.classList.add(classFromLoadingStatus);

    const [contentContainer, removeContentContainerListeners] = listenToElement(container,
        `:scope > .${__('content')}`)
        .on('keydown', (event: KeyboardEvent) => {
            const ctrlDown = event.ctrlKey || event.metaKey;
            if (ctrlDown && event.key === 'c') {
                const copyToClipboardCallback = compEvent('copy-to-clipboard-triggered');
                if (typeof copyToClipboardCallback === 'function') {
                    copyToClipboardCallback(event);
                }

                return;
            }
        })
        .on('click', (event: MouseEvent) => {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
        })
        .get();

    appendToRoot(container);

    const resizeListeners = new Set<Function>();
    const resizeObserver: ResizeObserver = new ResizeObserver(() => {
        compEvent('message-container-resized')();
    });

    let mdStreamRenderer: IObserver<string> | undefined;

    resizeObserver.observe(contentContainer);

    return {
        elements: {
            container,
            contentContainer,
        },
        actions: {
            focus: () => {
                contentContainer.focus();
            },
            appendContent: (content: string) => {
                if (!mdStreamRenderer) {
                    mdStreamRenderer = createMdStreamRenderer(contentContainer);
                }

                mdStreamRenderer.next(content);
            },
            commitContent: () => {
                if (mdStreamRenderer?.complete) {
                    mdStreamRenderer.complete();
                }

                mdStreamRenderer = undefined;
            },
            scrollToMessageEndContainer: () => {
                container.scrollIntoView({
                    block: 'end',
                    inline: 'end',
                    behavior: 'smooth',
                });
            },
            setContentStatus: (status: MessageContentLoadingStatus) => {
                container.classList.remove(classFromLoadingStatus);
                classFromLoadingStatus = `content-status-${status}`;
                container.classList.add(classFromLoadingStatus);
            },
        },
        onDestroy: () => {
            removeContentContainerListeners();
            resizeObserver.disconnect();
        },
    };
};