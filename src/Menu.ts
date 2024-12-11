
import "./Menu.css"

type ExtraClasses = string | string[]

function AddExtraClasses(target: HTMLElement, extraClasses?: string | string[]) {
	if (extraClasses) {
		if (!target.classList) throw `${target} does not have a classList`
		if (typeof extraClasses === 'string') extraClasses = extraClasses.split(' ')
		if (!Array.isArray(extraClasses) || extraClasses.some(c => typeof c !== 'string'))
			throw `${extraClasses} must be a string or an array of strings`

		extraClasses.forEach(c => target.classList.add(c))
	}
}

function stylePxToInt(value: string): number { return Number.parseInt(value.replaceAll('px', '')) }

function getTotal(style: CSSStyleDeclaration, properties: string[]) {
	return properties.reduce((total, property: any) => total + stylePxToInt(style[property]), 0)
}

export function getElementPath(element: any) {
	let path: any[] = [];
	let currentElem = element;
	while (currentElem) {
		path.push(currentElem);
		currentElem = currentElem.parentElement;
	}
	if (path.indexOf(window) === -1 && path.indexOf(document) === -1) {
		path.push(document);
	}
	if (path.indexOf(window) === -1) {
		path.push(window);
	}
	return path;
}


export class FigmentMenu extends HTMLElement {
	container?: HTMLDivElement
	menu?: HTMLDivElement
	items: MenuItem[] = []
	target?: HTMLElement

	constructor() {
		super();

		// this.attachShadow({ mode: 'open' })

		// // Apply external styles to the shadow dom
		// const cssLink = document.createElement('link')
		// cssLink.setAttribute('rel', 'stylesheet')
		// cssLink.setAttribute('href', `chrome-extension://${figmentId}/styles.css`)
		// this.shadowRoot?.appendChild(cssLink)

		// TODO: consider moving the menu and outline into the same shadow dom. 
		// Making the menu track the location of a target element that is in a
		// different shadow dom appears to be problematic for reading position data. 

		//watch for changes to the size of the document and just close the menu
		const resizeObserver = new ResizeObserver(() => {
			this.Clear()
		});

		resizeObserver.observe(document.body);

		//ensure any submenus scroll with the document
		document.addEventListener('scroll', () =>
			this.container?.querySelectorAll('.submenu')
				?.forEach(subMenu =>
					FigmentMenu.updateSubmenuPosition(subMenu as HTMLDivElement)
				)
		)
	}

	Clear() {
		this.container?.remove()
		this.container = undefined
		this.items.length = 0
	}

	static Create({ extraClasses }: { extraClasses: ExtraClasses }) {
		if (!customElements.get('figment-menu'))
			customElements.define('figment-menu', FigmentMenu)

		let figmentMenu = document.createElement('figment-menu')

		AddExtraClasses(figmentMenu, extraClasses)
		document.body.appendChild(figmentMenu)

		return figmentMenu
	}

	ShowFor(target: HTMLElement, extra?: HTMLElement) {
		if (!target) throw new Error('invalid target')
		this.target = target

		this.container = FigmentMenu.buildMenuElements(this.items)

		if (extra) {
			this.container.appendChild(extra)
		}

		target.appendChild(this.container)

		const menu = this.container.querySelector('div.figment-menu') as HTMLDivElement
		FigmentMenu.fixSmallMenuScroll(menu)
		FigmentMenu.fixContainerOverflow(this.container)


		const menuCleanup = (e: MouseEvent) => {
			if (menu) {
				const path = getElementPath(e.target)

				//don't close the menu when clicking on it
				if (!path.some(node => node.classList?.contains('menu-keep-open'))) {
					this.Clear()
					document.removeEventListener('mousedown', menuCleanup)
				}
			}
		}

		document.addEventListener('mousedown', menuCleanup)
	}



	private static fixSmallMenuScroll(menu: HTMLDivElement | null, minChildrenForScrolling = 3) {
		//allow a specified number of children to scroll, 
		// but expand the menu max-height if there are fewer than that

		if (!menu) throw new Error(`menu is ${menu}`)
		if (menu?.toString() !== '[object HTMLDivElement]') throw new Error('menu is not HTMLDivElement')

		const actualOverflow = (menu as HTMLElement)?.scrollHeight - (menu as HTMLElement)?.clientHeight
		const menuItemHeight = ((menu as HTMLElement)?.firstChild as HTMLElement)?.clientHeight
		const minAcceptableOverflow = menuItemHeight * minChildrenForScrolling

		if (actualOverflow > 0 && actualOverflow < minAcceptableOverflow) {
			// console.log('fixSmallMenuScroll', menu);
			// (menu.parentElement as HTMLElement).style.outline = "1px solid red";
			(menu as HTMLElement).style.maxHeight = "fit-content";
		}
	}

	private static fixContainerOverflow(container: HTMLDivElement) {
		//move the container to not overflow the viewport

		const computedContainerStyle = getComputedStyle(container)
		const rect = container.getBoundingClientRect()
		
		const top = getTotal(computedContainerStyle, ['top'])
		const left = getTotal(computedContainerStyle, ['left'])
		const right = getTotal(computedContainerStyle, ['left', 'width'])
		const bottom = rect.bottom

		const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

		const overflowX = right - document.documentElement.clientWidth - window.scrollX + scrollbarWidth
		const overflowY = bottom - document.documentElement.clientHeight - window.scrollY + (2 * scrollbarWidth)
		
		if (overflowX > 0) {
			console.log(`Fix overflow X: ${left} - ${overflowX} = ${left - overflowY}px`, container)
			container.style.left = (left - overflowX) + 'px'

			//TODO: handle submenu viewport overflow

			// if (overflowX > 50) {
			// 	//move the submenu to the left side
			// 	container.style.left = (left - container.clientWidth - (container.parentElement?.clientWidth ?? 0) + 'px')
			// 	container.previousElementSibling?.classList.add('left')
			// }
			// else {
			// 	container.style.left = (left - overflowX) + 'px'
			// }
		}
		if (overflowY > 0) {
			console.log(`Fix overflow Y: ${top} - ${overflowY} = ${top - overflowY}px`)
			container.style.top = container.parentElement.offsetTop - container.clientHeight + 'px'
		}
	}

	private static buildMenuElements(menuItems: MenuItem[]): HTMLDivElement {
		const container = document.createElement('div')
		container.className = 'figment-menu-container'

		const menu = document.createElement('div')
		menu.className = 'figment-menu'
		container.appendChild(menu)

		//recursively add submenus
		for (const menuItem of menuItems) {
			menu.appendChild(menuItem.div)
			if (menuItem.subMenuItems?.length) {
				const subMenuContainer = FigmentMenu.buildMenuElements(menuItem.subMenuItems)
				subMenuContainer.classList.add('submenu')

				//add invisible hover target to cover lower menu items but remove it 
				// if the mouse starts moving left. This is to let the user shortcut
				// across other menu items while moving the cursor to a submenu. 
				// If the menu appears to the left instead of the right, we will add
				// an other class that overrides the shape of the hover target polygon
				const hoverTarget = document.createElement('div')
				hoverTarget.className = 'submenu-hover-target'
				hoverTarget.style.display = 'none'
				hoverTarget.addEventListener('wheel', () => {
					hoverTarget.style.display = 'none'
				})
				hoverTarget.addEventListener('mousemove', (ev) => {
					if (ev.movementX != 0) {
						const menuIsLeft = hoverTarget.classList.contains('left')
						const menuIsRight = !menuIsLeft
						const movementIsLeft = ev.movementX < 0
						const movementIsRight = ev.movementX > 0
						//did the pointer move away from the submenu?
						//console.log(movementIsRight ? '→' : movementIsLeft ? '←' : '0')
						if ((menuIsLeft && movementIsRight) || (menuIsRight && movementIsLeft)) {
							hoverTarget.style.display = 'none'
						}
					}
				})
				menuItem.div.addEventListener('mouseleave', () => hoverTarget.style.display = 'none')
				menuItem.div.addEventListener('mouseenter', () => hoverTarget.style.display = 'block')
				menuItem.div.appendChild(hoverTarget)

				menuItem.div.appendChild(subMenuContainer)
				menuItem.div.classList.add('has-submenu')
				menuItem.div.parentElement?.addEventListener('scroll', () => FigmentMenu.updateSubmenuPosition(subMenuContainer))
				menuItem.div.parentElement?.addEventListener('mouseenter', () => FigmentMenu.updateSubmenuPosition(subMenuContainer))
			}
		}

		return container
	}

	private static updateSubmenuPosition(submenuContainer: HTMLDivElement) {
		const parentRect = submenuContainer.parentElement?.getBoundingClientRect();
		submenuContainer.style.top = `${parentRect?.top}px`
		submenuContainer.style.left = `${parentRect?.right}px`

		FigmentMenu.fixSmallMenuScroll(submenuContainer.firstChild as HTMLDivElement)
		FigmentMenu.fixContainerOverflow(submenuContainer)

		const submenuRect = submenuContainer.getBoundingClientRect()
		const hoverTarget = submenuContainer.parentElement?.querySelector('div.submenu-hover-target') as HTMLDivElement

		hoverTarget.style.top = `${parentRect?.top}px`
		//todo: get (submenu.parentElement?.style.paddingBlockEnd ?? 0) instead of hardcoding -3
		hoverTarget?.style.setProperty('margin-top', `${(parentRect?.height ?? 0) - 3}px`)
		hoverTarget?.style.setProperty('width', `${parentRect?.width}px`)
		hoverTarget?.style.setProperty('height', `${submenuRect.height - (parentRect?.height ?? 0)}px`)
	}

	AddItem(item: MenuItem) {
		this.items.push(item)
	}

	AddSeparator() {
		this.items.push(new MenuItem({ extraClasses: 'menu-separator' }))
	}

	AddScrollingContainer({ extraClasses, maxHeight }: { extraClasses?: ExtraClasses, maxHeight?: string } = {}) {
		let scrollingContainer = document.createElement('div')
		scrollingContainer.className = 'menu-scrolling-container'
		if (maxHeight) scrollingContainer.style.maxHeight = maxHeight
		AddExtraClasses(scrollingContainer, extraClasses)
		this.menu?.appendChild(scrollingContainer);
		return scrollingContainer;
	}
}

type MenuItemOptions = {
	id?: string,
	text?: string,
	textClass?: string,
	textData?: string,
	onTextClick?: (this: HTMLSpanElement, ev: MouseEvent) => any,
	subtext?: string,
	href?: string,
	extraClasses?: ExtraClasses,
	imageSrc?: string,
	onSubTextClick?: (this: HTMLSpanElement, ev: MouseEvent) => any,
	onSubTextMouseDown?: (this: HTMLSpanElement, ev: MouseEvent) => any,
	onSubTextMouseUp?: (this: HTMLSpanElement, ev: MouseEvent) => any,
	mouseEnter?: (this: HTMLSpanElement, ev: MouseEvent) => void,
	mouseLeave?: (this: HTMLSpanElement, ev: MouseEvent) => void,
	subItems?: MenuItem[],
}

export class MenuItem {

	id?: string
	div: HTMLDivElement
	img?: HTMLImageElement
	expando?: HTMLDivElement
	subMenuItems: MenuItem[] = []
	text: string

	constructor({
		id,
		text,
		textClass,
		textData,
		subtext,
		href,
		extraClasses,
		imageSrc,
		subItems,
		onTextClick,
		onSubTextClick,
		onSubTextMouseUp,
		onSubTextMouseDown,
		mouseEnter,
		mouseLeave
	}: MenuItemOptions) {
		this.id = id
		this.div = document.createElement('div')
		this.div.classList.add('menu-item')
		this.text = text

		AddExtraClasses(this.div, extraClasses)

		let textSpan = document.createElement('span')
		textSpan.className = 'menu-text'
		textSpan.textContent = text
		if (textData) textSpan.setAttribute('data-text', textData)
		if (textClass) textSpan.classList.add(textClass)

		if (onTextClick) {
			textSpan.classList.add('menu-keep-open')
			textSpan.addEventListener('click', onTextClick)
		}

		if (href) {
			let a = document.createElement('a');
			a.href = href;
			a.target = '_blank';
			a.classList.add('menu-btn');
			this.div.appendChild(a);
			a.appendChild(textSpan);
		}
		else
			this.div.appendChild(textSpan)

		if (mouseEnter) this.div.addEventListener("mouseenter", mouseEnter)
		if (mouseLeave) this.div.addEventListener("mouseleave", mouseLeave)

		if (subtext) {
			let subtextSpan = document.createElement('span')
			subtextSpan.className = 'menu-subtext'
			subtextSpan.textContent = subtext
			this.div.appendChild(subtextSpan)

			if (onSubTextClick) {
				subtextSpan.classList.add('menu-keep-open')
				subtextSpan.addEventListener('click', onSubTextClick)
			}

			if (onSubTextMouseUp) subtextSpan.addEventListener('mouseup', onSubTextMouseUp)
			if (onSubTextMouseDown) subtextSpan.addEventListener('mousedown', onSubTextMouseDown)
		}

		if (imageSrc) this.imageSrc = imageSrc

		subItems?.forEach(s => this.AddSubItem(s))
	}

	get imageSrc() { return this.img?.src }

	set imageSrc(value) {
		if (value) {
			if (!this.img) {
				this.img = document.createElement('img')
				this.div.appendChild(this.img)
				this.img.className = 'menu-image'
			}
			this.img.src = value ?? ''
		}
		else if (this.img) this.img.remove()
	}

	set imageHeight(value: number) {
		if (Number.isSafeInteger(value) && this.img) this.img.height = value
	}

	AddSubItem(item: MenuItem) {
		this.subMenuItems.push(item)
	}

	get Expando() {
		if (!this.expando) {
			let checkbox = document.createElement('input')
			checkbox.id = `collapsible-${Math.random().toString(16).slice(2)}`
			checkbox.className = "menu-item-grid-prefix toggle"
			checkbox.type = "checkbox"

			let label = document.createElement('label')
			label.setAttribute('for', checkbox.id)
			label.className = 'menu-item-grid-prefix lbl-toggle menu-keep-open'
			this.div.prepend(label)
			this.div.prepend(checkbox)

			let content = document.createElement('div')
			content.className = 'menu-item-grid-expando collapsible-content menu-keep-open'
			this.div.appendChild(content)
			let inner = document.createElement('div')
			inner.className = 'content-inner'
			content.appendChild(inner)

			this.expando = inner
		}
		return this.expando
	}

	AddExpandoItem(item: HTMLElement) {
		this.Expando.appendChild(item)
	}
}