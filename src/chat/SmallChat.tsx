import { Accessor, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Connection, DM } from "../../server/types";

import * as server from "../data/data";
import * as directMessages from "../data/directMessages";

import "./Chat.css"
import { uiLog } from "../uiLog";

export default function SmallChat(props: { connection: Accessor<Connection | undefined> }) {

	console.log('smallchat', props.connection())
	if (!props.connection) return <>no connection!</>

	let messagesRef: HTMLDivElement
	let inputRef: HTMLInputElement
	let onNewMessage_AbortController: AbortController

	const [dmList, setDmList] = createSignal<DM[]>([], { equals: false })

	const scrollToLatest = (behavior: ScrollBehavior = "auto") => messagesRef!.lastElementChild?.scrollIntoView({ behavior: behavior, block: "center", inline: "nearest" })

	onMount(async () => {
		let history = await directMessages.getLatestHistory(props.connection()!?.id, 60)
		setDmList(history)
		scrollToLatest()
		inputRef!?.focus()

		if (onNewMessage_AbortController) throw new Error('abort controller must be null')

		//not sure I like this pattern
		onNewMessage_AbortController = directMessages.onNewMessageForConnection(props.connection()!, (dm: DM) => {

			console.log('SmallChat for', props.connection()!.id, 'got message from', dm.fromName, 'to', dm.toId)

			if (![dm.fromId, dm.toId].includes(props.connection()!.id))
				return //this message is for a different connection 

			setDmList([...dmList(), dm])
			scrollToLatest("smooth")
		})
	})

	onCleanup(() => {
		onNewMessage_AbortController.abort()
	})

	async function sendDm(con: Connection, message: string) {
		try {
			if (!con) throw new Error(`con is ${con}`)
			if (!con.publicKey) throw new Error(`con.publicKey is ${con.publicKey}`)

			const self = server.self();
			if (!self) throw new Error(`self is ${self}`)

			const dm: DM = {
				toId: con.id,
				fromId: self.id,
				fromName: self.identity?.name,
				timestamp: Date.now(),
				message,
				kind: "text"
			}
			await directMessages.sendDm(dm, con.publicKey)
			setDmList([...dmList(), dm])

			//scroll last message into view
			const dmElements = Array.from(document.getElementsByClassName('dm'));
			dmElements[dmElements.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
			scrollToLatest("smooth")
		} catch (err) {
			uiLog((err as any)?.message ?? 'error sending dm')
			console.error(err)
		}
	}

	const onMessageKeyDown = async (e: KeyboardEvent, con: Connection) => {
		const input = e.target as HTMLTextAreaElement
		const message = input.value?.trim()
		if (e.key === 'Enter' && message) {
			input.value = '';
			sendDm(con, message);
		}
	}


	return <div class="small-chat">
		<div class="messages" ref={messagesRef!}>
			<For each={dmList()}>
				{dm => <div class="message" classList={{
					'incoming': dm.fromId == props.connection()?.id,
					'outgoing': dm.toId == props.connection()?.id
				}}>
					{dm.message as string}
				</div>}
			</For>
		</div>
		<input
			ref={inputRef!}
			class='dm-send-input'
			type="text"
			placeholder={`To ${props.connection()?.identity?.name}...`}
			onKeyDown={(e) => onMessageKeyDown(e, props.connection()!)}>
		</input>
	</div>
}
