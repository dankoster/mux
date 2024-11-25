import { createEffect, createSignal, For, Show } from "solid-js"
import { Connection, DM } from "../server/types";
import { ageTimestamp, diffTime, shortTime } from "./time";

import * as directMessages from "./data/directMessages";
import * as server from "./data/data";

import "./Chat.css"

let inputRef: HTMLInputElement

export const scrollLatestMessageIntoView = () => {

	//scroll last message into view
	const dmElements = Array.from(document.getElementsByClassName('dm'));
	dmElements[dmElements.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

	//scroll input into view
	inputRef?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
	inputRef?.focus()
}

const [dmList, setDmList] = createSignal<directMessages.groupedDM[][]>([], { equals: false })
const [dmError, setDmError] = createSignal("")
const [selectedDmTarget, setSelectedDmTarget] = createSignal<Connection>()


export default function Chat(props: { connection: Connection, onClose: () => void }) {

	directMessages.onNewMessage((dm: DM) => {
		updateDmDisplay(dm)
	})


	createEffect(() => {
		console.log('CHAT - connection changed to', props.connection)
		showDmConversation(props.connection)
	})

	const showDmConversation = async (con: Connection) => {
		setDmError(null)
		setSelectedDmTarget(con)

		if (!con) return
		if (!con.publicKey) {
			setDmError(`Cannot enctypt messages to ${con.identity?.name}! They need to sign in to generate a public key.`)
			return
		}
		try {
			let history = await directMessages.getRecentHistory(con.id, con.publicKey)
			const lastRead = directMessages.lastReadTimestamp(con.id)

			console.log('showDmConversation', { lastRead, history })

			//TODO: visually mark each message after the timestamp as unread

			const groupedBySender = directMessages.groupBySender(history)
			setDmList(groupedBySender)
			scrollLatestMessageIntoView()
			directMessages.setLastReadNow(con.id)

			console.log('lastReadDmByConId', lastRead)
		} catch (err) {
			setDmError(err.message)
		}
	}

	async function updateDmDisplay(dm: DM) {

		const fromCon = server.connections.find(c => c.id === dm.fromId)
		const toCon = server.connections.find(c => c.id === dm.toId)

		//handle messages from self on a different connection
		const con = server.isSelf(fromCon) ? toCon : fromCon

		//update our local display of messages
		const targetId = selectedDmTarget()?.id
		console.log({ conId: con.id, targetId })
		if (con.id === targetId) {
			const messages = await directMessages.getRecentHistory(con.id, con.publicKey)
			const latestMessage = messages[messages.length - 1]
			const groupedBySender = directMessages.groupBySender(messages)
			setDmList(groupedBySender)
			scrollLatestMessageIntoView()
			directMessages.setLastReadTimestamp(con.id, latestMessage.timestamp)
		}
	}

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
			await directMessages.sendDm(dm, con.publicKey);
			updateDmDisplay(dm);
		} catch (err) {
			setDmError(err.message);
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

	const onSendButtonClick = async (input: HTMLTextAreaElement, con: Connection) => {
		const message = input.value?.trim()
		if (message) {
			input.value = '';
			sendDm(con, message);
		}
	}

	const avatarUrl = (conId: string) => {
		const con = server.connections.find(c => c.id === conId)
		return con?.identity?.avatar_url
	}


	return <div class="chat">
		<div class="dm-chat">
			<div class="dm-header">
				<span>Chat with {selectedDmTarget()?.identity?.name}</span>
				<button onclick={props.onClose}>close</button>
			</div>
			<Show when={dmError()}>ERROR: {dmError()}</Show>
			<Show when={!dmError()}>
				<div class="dm-scrolling">
					<div class="dm-list">
						<For each={dmList()}>
							{dmGroup => {
								const firstMessage = dmGroup[0]
								const diff = diffTime(firstMessage.timestamp, firstMessage.prevTimestamp)
								const moreMessages = dmGroup.slice(1)
								return <>
									<Show when={diff}><div class="dm-diffTime">{diff}</div></Show>
									<div class="dm">
										<div class="dm-avatar">
											<img alt={firstMessage.fromName} src={avatarUrl(firstMessage.fromId)} />
										</div>
										<div class="dm-first-message">
											<div class="dm-sender">
												{firstMessage.fromName || firstMessage.fromId}
											</div>
											<div class="dm-timestamp">
												{ageTimestamp(firstMessage.timestamp)}
											</div>
											<div class="dm-content">{firstMessage.message as string}</div>
										</div>
										<For each={moreMessages}>{(dm) => {
											const diff2 = diffTime(dm.timestamp, dm.prevTimestamp)
											return <>
												<Show when={diff2}><div class="dm-diffTime">{diff2}</div></Show>
												<div class="dm-message">
													<span class="dm-timestamp">{shortTime(dm.timestamp)}</span>
													<span class="dm-content">{dm.message as string}</span>
												</div>
											</>
										}
										}</For>
									</div>
								</>
							}}
						</For>
					</div>
				</div>
				<div class="dm-send">
					<input
						ref={inputRef}
						class='dm-send-input'
						type="text"
						placeholder={`Message ${selectedDmTarget()?.identity?.name}...`}
						onKeyDown={(e) => onMessageKeyDown(e, selectedDmTarget())} />
					<button
						class='dm-send-button'
						onclick={(e) => onSendButtonClick(
							e.target.previousElementSibling as HTMLTextAreaElement,
							selectedDmTarget())}>
						⏎
					</button>
				</div>
			</Show>
		</div>
	</div>
}