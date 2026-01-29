1. When we implement a parallel task implementation mode (not for a while) we will need to figure out a few things:
 A: How to have two EMERGENT_REFINEMENT tasks not choose to work on the exact same thing? (do we cap these to just 1 at a time?) (how do we merge their work if this is the case?)
 B: Reserving specific single instance infrastructure from validation tooling. (Do we just work to make it so that all vliadation tools can be run in a completely seperate instance? Ideally yes...)


 2. When prompt loops are in effect, we should have a globally session stored flag that shows that there are prompts are currently being implemented. This will be used to stop:
  A: Switching current spec