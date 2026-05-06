import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Connection, DM } from "../../server/types";

import * as directMessages from "../data/directMessages";
import * as server from "../data/data";

import "./Chat.css"
import { uiLog } from "../uiLog";

export default function SmallChat(props: { connection: Connection }) {

	let messagesRef: HTMLDivElement

	const [dmList, setDmList] = createSignal<DM[]>([], { equals: false })

	directMessages.onNewMessage((dm: DM) => {
		setDmList([...dmList(), dm])
		scrollToLatest()
	})

	const scrollToLatest = () => messagesRef.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })

	onMount(async () => {
		let history = await directMessages.getLatestHistory(props.connection.id, 60)
		setDmList(history)
		scrollToLatest()
	})

	onCleanup(() => {
		//todo cleanup
	})

	async function sendDm(con: Connection, message: string) {
		try {
			const self = server.self();
			const dm: DM = {
				toId: con.id,
				fromId: self.id,
				fromName: self.identity?.name,
				message,
				kind: "text"
			}
			await directMessages.sendDm(dm, con.publicKey)
			setDmList([...dmList(), dm])

			//scroll last message into view
			const dmElements = Array.from(document.getElementsByClassName('dm'));
			dmElements[dmElements.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
			scrollToLatest()
		} catch (err) {
			uiLog(err.message)
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
		<div class="messages" ref={messagesRef}>
			<For each={dmList()}>
				{dm => <div class="message" classList={{
					'incoming': dm.fromId == props.connection.id,
					'outgoing': dm.toId == props.connection.id
				}}>
					{dm.message as string}
				</div>}
			</For>
		</div>
		<input
			class='dm-send-input'
			type="text"
			placeholder={`To ${props.connection?.identity?.name}...`}
			onKeyDown={(e) => onMessageKeyDown(e, props.connection)}>
		</input>
	</div>
}
