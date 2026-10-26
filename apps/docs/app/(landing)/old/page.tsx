import { HeroLinks } from "@/components/links";
import { LogoEnglish } from "@/components/icon/LogoEnglish";

export default function Page() {
	return (
		<>
			<div className="absolute w-screen h-screen inset-0 -z-10">
				<div
					className="absolute blur-[100px] rounded-full translate-y-50
                    bottom-0 left-2/5 size-125 lg:size-[40vw] 2xl:size-[30vw] bg-linear-to-r
                    from-blue-500/20 to-purple-500/20
                    dark:from-blue-600/30 dark:to-purple-600/30  "
				/>
				<div
					className="absolute blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2
                    top-1/2 lg:top-0 right-0 size-180 lg:size-[48vw] 2xl:size-[42vw] bg-linear-to-r
                    from-cyan-500/15 to-blue-500/15
                    dark:from-cyan-600/20 dark:to-blue-600/20"
				/>
				<div
					className="absolute blur-[100px] rounded-full
                    top-0 max-lg:left-0 lg:left-3/4 lg:top-1/2 size-200 lg:size-[57vw] 2xl:size-[50vw] bg-linear-to-r -translate-1/2
                    from-orange-500/20 to-purple-500/20
                    dark:from-orange-600/30 dark:to-purple-600/30"
				/>
			</div>

			<div className="relative max-lg:w-full xl:left-[min(8vw,12rem)] max-xl:mx-auto px-6 md:px-12 lg:px-16 z-10 dark:text-white">
				<div className="max-w-3xl text-left">
					<div className="mb-8 flex justify-start">
						<div className="origin-left opacity-75 hover:opacity-100 transition-opacity duration-300">
							<LogoEnglish className="h-8 md:h-9 w-auto translate-x-1" />
						</div>
					</div>

					<h1 className="text-5xl sm:text-6xl lg:text-7xl font-extralight tracking-tight mb-6 leading-[1.1]">
						Archive for a Better Future
					</h1>

					<p
						className="text-black/70 dark:text-white/60 text-lg 
                            lg:text-xl mb-10 leading-relaxed max-w-2xl"
					>
						Project CVSA is an archive program aiming to collect and preserve all
						information about the Chinese singing voice synthesis community.
					</p>

					<div className="flex justify-start">
						<HeroLinks />
					</div>
				</div>
			</div>
		</>
	);
}
